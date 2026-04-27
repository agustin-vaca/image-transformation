/// <reference lib="webworker" />
//
// Runs @imgly/background-removal off the main thread. WASM compile + ONNX
// inference do enough sync work to stall the main-thread renderer (frozen
// spinner / paused message rotation). Inside a dedicated worker the main
// thread stays idle and CSS animations + React state updates keep ticking.

import {
  preload,
  removeBackground,
  type Config,
} from "@imgly/background-removal";

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

// Model selection: imgly ships three ISNet variants — `isnet_quint8`
// (~22 MB int8, fastest, weakest edges), `isnet_fp16` (~44 MB, much
// better hair/fur/fine detail, still WASM-friendly) and `isnet` (~88 MB
// fp32, marginal additional quality at 2x the bandwidth). We default to
// fp16 because the visible quality jump over quint8 is large and the
// extra ~22 MB is paid only on the cold load — our on-intent preload
// usually finishes before the visitor picks a file, and the EMA ETA
// adapts to the real download time.
const CONFIG: Config = { model: "isnet_fp16" };

function makeProgressHandler(id: number) {
  // Aggregate per-asset progress into a single 0..100 number, throttled to
  // integer changes so we don't flood the message channel.
  const totals = new Map<string, { current: number; total: number }>();
  let last = -1;
  return (key: string, current: number, total: number) => {
    totals.set(key, { current, total });
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
      await preload({ ...CONFIG, progress: makeProgressHandler(msg.id) });
      ctx.postMessage({ id: msg.id, type: "done" } satisfies DoneMsg);
      return;
    }
    if (msg.type === "remove") {
      const result = await removeBackground(msg.blob, {
        ...CONFIG,
        output: { format: "image/png" },
        progress: makeProgressHandler(msg.id),
      });
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
