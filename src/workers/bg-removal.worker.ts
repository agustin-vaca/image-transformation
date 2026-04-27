/// <reference lib="webworker" />
//
// Runs background removal off the main thread using @huggingface/transformers
// (transformers.js) with the BiRefNet matting model (MIT-licensed,
// commercially safe). Inference + WASM/WebGPU compile do enough sync work
// to stall the main-thread renderer, so we keep them inside a dedicated
// worker so the spinner / rotating headlines keep ticking.
//
// Why BiRefNet:
// - Currently the leading open-weight matting model on hair / fur / glass /
//   complex edges. Visibly cleaner than RMBG-1.4 and the ISNet variants.
// - MIT licensed (no non-commercial caveat).
// - Bigger weights (~110 MB fp16, ~220 MB fp32). Mitigated by on-intent
//   preload + the smooth-progress UI absorbing a longer cold load. We try
//   WebGPU + fp16 first for fast inference; fall back to WASM + fp32 on
//   browsers/devices that lack WebGPU.

import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
  type ProgressInfo,
  type PreTrainedModel,
  type Processor,
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

const MODEL_ID = "onnx-community/BiRefNet-ONNX";

type Loaded = { model: PreTrainedModel; processor: Processor };
let loadPromise: Promise<Loaded> | undefined;

async function tryLoad(
  device: "webgpu" | "wasm",
  dtype: "fp16" | "fp32",
  onProgress?: (info: ProgressInfo) => void,
): Promise<Loaded> {
  const model = (await AutoModel.from_pretrained(MODEL_ID, {
    device,
    dtype,
    progress_callback: onProgress,
  })) as PreTrainedModel;
  const processor = (await AutoProcessor.from_pretrained(MODEL_ID, {
    progress_callback: onProgress,
  })) as Processor;
  return { model, processor };
}

function getModel(
  onProgress?: (info: ProgressInfo) => void,
): Promise<Loaded> {
  if (loadPromise) return loadPromise;
  // WebGPU + fp16 ≈ 110 MB and runs an order of magnitude faster than
  // WASM. If WebGPU isn't available (Safari, older Chrome on Linux,
  // strict enterprise policies) we fall back to WASM + fp32 (~220 MB)
  // which is universal but slower. Quality is effectively identical.
  const attempt = (async () => {
    try {
      return await tryLoad("webgpu", "fp16", onProgress);
    } catch (webgpuError) {
      try {
        return await tryLoad("wasm", "fp32", onProgress);
      } catch (wasmError) {
        // Surface both root causes so the client error toast / telemetry
        // isn't just "wasm failed". The WebGPU error is the original
        // failure that triggered the fallback in the first place.
        const webgpuMessage =
          webgpuError instanceof Error ? webgpuError.message : String(webgpuError);
        const wasmMessage =
          wasmError instanceof Error ? wasmError.message : String(wasmError);
        throw new Error(
          `Failed to load background-removal model. WebGPU: ${webgpuMessage}. WASM: ${wasmMessage}`,
        );
      }
    }
  })();
  // Only cache the success. If both backends fail (e.g. transient network
  // error fetching weights from the HF CDN) clear the cached promise so
  // the next preload/remove attempt can retry instead of forever replaying
  // a rejected promise.
  loadPromise = attempt.catch((err) => {
    loadPromise = undefined;
    throw err;
  });
  return loadPromise;
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

// Composite a single-channel mask onto the original RGB(A) image and
// encode as PNG with proper alpha. BiRefNet only outputs the mask — we
// have to combine it with the source pixels ourselves.
async function applyMask(
  source: RawImage,
  mask: RawImage,
): Promise<Blob> {
  const w = source.width;
  const h = source.height;
  const srcChannels = source.channels;
  const srcData = source.data;
  const maskData = mask.data;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const sIdx = i * srcChannels;
    rgba[i * 4 + 0] = srcData[sIdx + 0] ?? 0;
    rgba[i * 4 + 1] = srcData[sIdx + 1] ?? srcData[sIdx + 0] ?? 0;
    rgba[i * 4 + 2] = srcData[sIdx + 2] ?? srcData[sIdx + 0] ?? 0;
    rgba[i * 4 + 3] = maskData[i] ?? 0;
  }
  const canvas = new OffscreenCanvas(w, h);
  const cctx = canvas.getContext("2d");
  if (!cctx) throw new Error("OffscreenCanvas 2D context unavailable");
  cctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

ctx.onmessage = async (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  try {
    if (msg.type === "preload") {
      await getModel(makeProgressHandler(msg.id));
      ctx.postMessage({ id: msg.id, type: "done" } satisfies DoneMsg);
      return;
    }
    if (msg.type === "remove") {
      // If the user uploads before the preload finishes, the same promise
      // is reused — no double download. Progress events on this id only
      // fire on a true cold start.
      const { model, processor } = await getModel(makeProgressHandler(msg.id));
      const source = await RawImage.fromBlob(msg.blob);
      // Processor handles the BiRefNet-specific resize + normalization.
      const inputs = (await processor(source)) as { pixel_values: unknown };
      const out = (await model({ input_image: inputs.pixel_values })) as {
        output_image: { sigmoid: () => { mul: (n: number) => { to: (t: string) => unknown } } }[];
      };
      const tensor = out.output_image[0]?.sigmoid().mul(255).to("uint8");
      if (!tensor) throw new Error("BiRefNet returned no output tensor");
      const mask = await RawImage.fromTensor(
        tensor as unknown as Parameters<typeof RawImage.fromTensor>[0],
      ).resize(source.width, source.height);
      const result = await applyMask(source, mask);
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
