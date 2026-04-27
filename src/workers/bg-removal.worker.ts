/// <reference lib="webworker" />
//
// Runs background removal off the main thread using @huggingface/transformers
// (transformers.js) with the BRIA RMBG-1.4 model. ONNX inference + WASM
// compile do enough sync work to stall the main-thread renderer (frozen
// spinner / paused message rotation), so we keep it inside a dedicated
// worker so the main-thread CSS animations and React state updates keep
// ticking.
//
// Why RMBG-1.4 instead of imgly's ISNet variants:
// - Visibly better edges on hair, fur, translucent fabrics — the dimension
//   imgly's quint8/fp16 ISNet struggles with.
// - Same in-browser, zero-cost path (no API key, no quota).
// - Caveat: BRIA RMBG-1.4 is licensed for non-commercial use. Acceptable
//   for a portfolio/demo; commercial productization would need a BRIA
//   commercial license or a different model.

import {
  pipeline,
  RawImage,
  env,
  type ProgressInfo,
  type BackgroundRemovalPipeline,
} from "@huggingface/transformers";

type PreloadMsg = { id: number; type: "preload" };
type RemoveMsg = {
  id: number;
  type: "remove";
  blob: Blob;
};
type InMsg = PreloadMsg | RemoveMsg;

type ProgressMsg = { id: number; type: "progress"; pct: number };
type DoneMsg = { id: number; type: "done"; result?: Blob };
type ErrorMsg = { id: number; type: "error"; message: string };
export type OutMsg = ProgressMsg | DoneMsg | ErrorMsg;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Pull all assets from the HF CDN. Local-model lookup would otherwise
// resolve relative to the worker URL and 404 in production.
env.allowLocalModels = false;
env.allowRemoteModels = true;

const MODEL_ID = "briaai/RMBG-1.4";

let pipePromise: Promise<BackgroundRemovalPipeline> | undefined;

function getPipeline(
  onProgress?: (info: ProgressInfo) => void,
): Promise<BackgroundRemovalPipeline> {
  pipePromise ??= pipeline("background-removal", MODEL_ID, {
    // WASM is the safest default — WebGPU isn't universally available yet.
    // The model is small enough (~88 MB fp32) that WASM inference is
    // acceptable, and avoiding WebGPU sidesteps a class of driver bugs.
    device: "wasm",
    dtype: "fp32",
    progress_callback: onProgress,
  }) as unknown as Promise<BackgroundRemovalPipeline>;
  return pipePromise;
}

function readKey(info: ProgressInfo): string {
  // ProgressInfo is a discriminated union; `file` / `name` only exist on
  // some variants. Read defensively without an `any` cast.
  const rec = info as unknown as Record<string, unknown>;
  const file = typeof rec.file === "string" ? rec.file : undefined;
  const name = typeof rec.name === "string" ? rec.name : undefined;
  return file ?? name ?? "asset";
}

function makeProgressHandler(id: number) {
  // Aggregate per-asset download progress into a single 0..100 number,
  // throttled to integer changes so we don't flood the message channel.
  // Once a file is fully downloaded transformers.js emits a `done`/`ready`
  // status with no `total`; treat that as 100% for that asset.
  const totals = new Map<string, { current: number; total: number }>();
  let last = -1;
  return (info: ProgressInfo) => {
    const status = info.status;
    if (status === "progress" || status === "download") {
      const rec = info as unknown as Record<string, unknown>;
      const total = typeof rec.total === "number" ? rec.total : 0;
      const current = typeof rec.loaded === "number" ? rec.loaded : 0;
      totals.set(readKey(info), { current, total });
    } else if (status === "done" || status === "ready") {
      const key = readKey(info);
      const prev = totals.get(key);
      if (prev) totals.set(key, { current: prev.total, total: prev.total });
    } else {
      return;
    }
    let sumC = 0;
    let sumT = 0;
    for (const v of totals.values()) {
      sumC += v.current;
      sumT += v.total;
    }
    if (sumT <= 0) return;
    const pct = Math.round((sumC / sumT) * 100);
    if (pct === last) return;
    last = pct;
    ctx.postMessage({ id, type: "progress", pct } satisfies ProgressMsg);
  };
}

ctx.onmessage = async (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  try {
    if (msg.type === "preload") {
      await getPipeline(makeProgressHandler(msg.id));
      ctx.postMessage({ id: msg.id, type: "done" } satisfies DoneMsg);
      return;
    }
    if (msg.type === "remove") {
      // If the user uploads before the preload finishes, the same promise
      // is reused — no double download. Progress events on this id only
      // fire on a true cold start.
      const segmenter = await getPipeline(makeProgressHandler(msg.id));
      const input = await RawImage.fromBlob(msg.blob);
      const output = (await segmenter(input)) as unknown as RawImage[];
      const cutout = output[0];
      if (!cutout) throw new Error("RMBG returned no result");
      // RawImage.toBlob() yields a PNG with the alpha mask already
      // applied — exactly what we ship to R2.
      const result = await cutout.toBlob("image/png");
      ctx.postMessage({ id: msg.id, type: "done", result } satisfies DoneMsg);
      return;
    }
  } catch (err) {
    ctx.postMessage({
      id: msg.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    } satisfies ErrorMsg);
  }
};
