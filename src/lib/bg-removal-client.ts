// Singleton wrapper around bg-removal.worker.ts. The worker hosts imgly +
// onnxruntime-web off the main thread so the UI stays responsive (spinner,
// rotating messages) while WASM compile + ONNX inference run.

import type { OutMsg } from "@/workers/bg-removal.worker";

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  number,
  {
    resolve: (b: Blob | undefined) => void;
    reject: (e: Error) => void;
    onProgress?: (pct: number) => void;
  }
>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    new URL("../workers/bg-removal.worker.ts", import.meta.url),
    { type: "module" },
  );
  worker.onmessage = (ev: MessageEvent<OutMsg>) => {
    const msg = ev.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    if (msg.type === "progress") {
      entry.onProgress?.(msg.pct);
      return;
    }
    pending.delete(msg.id);
    if (msg.type === "done") entry.resolve(msg.result);
    else entry.reject(new Error(msg.message));
  };
  worker.onerror = (ev) => {
    // Surface a worker-level crash to every in-flight caller so they can
    // retry instead of hanging.
    const err = new Error(ev.message || "Background-removal worker crashed");
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(err);
    }
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

// Subscribers receive aggregated 0..100 progress while preload is in flight.
let preloadPromise: Promise<void> | undefined;
let preloadProgress = 0;
const preloadSubscribers = new Set<(pct: number) => void>();

export function getPreloadProgress(): number {
  return preloadProgress;
}

export function warmupModel(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (onProgress) {
    onProgress(preloadProgress);
    preloadSubscribers.add(onProgress);
  }
  preloadPromise ??= (async () => {
    const id = nextId++;
    try {
      await new Promise<void>((resolve, reject) => {
        pending.set(id, {
          resolve: () => resolve(),
          reject,
          onProgress: (pct) => {
            preloadProgress = pct;
            for (const cb of preloadSubscribers) cb(pct);
          },
        });
        getWorker().postMessage({ id, type: "preload" });
      });
      preloadProgress = 100;
      for (const cb of preloadSubscribers) cb(100);
    } catch (err) {
      // Don't trap subsequent attempts behind a permanently-rejected promise.
      preloadPromise = undefined;
      preloadProgress = 0;
      throw err;
    } finally {
      preloadSubscribers.clear();
    }
  })();
  return preloadPromise;
}

export function removeBackgroundInWorker(blob: Blob): Promise<Blob> {
  const id = nextId++;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, {
      resolve: (b) => {
        if (!b) reject(new Error("Worker returned no result"));
        else resolve(b);
      },
      reject,
    });
    getWorker().postMessage({ id, type: "remove", blob });
  });
}
