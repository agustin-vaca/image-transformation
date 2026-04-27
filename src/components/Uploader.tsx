"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse, ImageDTO } from "@/lib/api";
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/api";

type Status =
  | { kind: "idle" }
  | { kind: "loadingModel"; progress: number } // 0..100, sum of asset downloads
  | { kind: "removingBackground" } // model running, no progress events
  | { kind: "uploading"; progress: number } // 0..100, real bytes from XHR
  | { kind: "processing" } // upload done; server flips + R2 puts
  | { kind: "error"; message: string };

const ACCEPTED = ACCEPTED_MIME_TYPES.join(",");
const ACCEPTED_SET = new Set<string>(ACCEPTED_MIME_TYPES);

// Rotating one-liners shown while the local model crunches the image.
const PROCESSING_MESSAGES: ReadonlyArray<string> = [
  "Removing background\u2026",
  "Teaching pixels to face the other way\u2026",
  "Asking the background to please leave\u2026",
  "Negotiating with stubborn pixels\u2026",
  "Holding up a tiny mirror\u2026",
  "Convincing photons to swap sides\u2026",
  "Yelling \u2018left is the new right\u2019\u2026",
  "Polishing your reflection\u2026",
  "Doing yoga with your photo\u2026",
  "Almost there. Probably.\u2026",
];
const MESSAGE_ROTATION_MS = 2500;

// Lazy-cached imgly module + asset preload promise. The module is ~200KB JS
// plus ~40MB of WASM/ONNX weights, so we only load when the user shows
// intent (hover, focus, drag-enter, or first file pick).
type ImglyModule = typeof import("@imgly/background-removal");
let imglyPromise: Promise<ImglyModule> | undefined;
let preloadPromise: Promise<void> | undefined;

function loadImgly(): Promise<ImglyModule> {
  imglyPromise ??= import("@imgly/background-removal");
  return imglyPromise;
}

/** Kick off the model + WASM download in the background. Idempotent. */
function warmupModel(onProgress?: (pct: number) => void): Promise<void> {
  preloadPromise ??= (async () => {
    const mod = await loadImgly();
    // The library reports many keys (wasm, onnx, configs). Aggregate them
    // into a single 0..100% so the UI can show one bar.
    const totals = new Map<string, { current: number; total: number }>();
    await mod.preload({
      model: "isnet_quint8",
      progress: (key: string, current: number, total: number) => {
        totals.set(key, { current, total });
        if (!onProgress) return;
        let sumC = 0;
        let sumT = 0;
        for (const v of totals.values()) {
          sumC += v.current;
          sumT += v.total;
        }
        if (sumT > 0) onProgress(Math.round((sumC / sumT) * 100));
      },
    });
  })();
  return preloadPromise;
}

function uploadWithProgress(
  blob: Blob,
  filename: string,
  onProgress: (pct: number) => void,
  onUploaded: () => void,
): Promise<ApiResponse<ImageDTO>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.upload.onload = () => onUploaded();
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onload = () => {
      const body = xhr.response as ApiResponse<ImageDTO> | null;
      if (body && typeof body === "object" && "ok" in body) {
        resolve(body);
      } else {
        reject(new Error(`Unexpected response (status ${xhr.status})`));
      }
    };
    const form = new FormData();
    form.append("file", blob, filename);
    xhr.send(form);
  });
}

export function Uploader() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy =
    status.kind === "loadingModel" ||
    status.kind === "removingBackground" ||
    status.kind === "uploading" ||
    status.kind === "processing";

  // Rotate the funny messages every MESSAGE_ROTATION_MS while bg-removal is
  // running.
  useEffect(() => {
    if (status.kind !== "removingBackground" && status.kind !== "processing") {
      return;
    }
    const offset =
      1 + Math.floor(Math.random() * (PROCESSING_MESSAGES.length - 1));
    let step = offset;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + step) % PROCESSING_MESSAGES.length);
      step = 1;
    }, MESSAGE_ROTATION_MS);
    return () => clearInterval(interval);
  }, [status.kind]);

  // Hint the browser to start fetching imgly + assets the first time the user
  // shows intent. Failure is silent — the upload path will retry with UI.
  const intentTriggered = useRef(false);
  const onIntent = useCallback(() => {
    if (intentTriggered.current) return;
    intentTriggered.current = true;
    void warmupModel().catch(() => {
      /* surface on actual upload */
    });
  }, []);

  const upload = useCallback(
    async (file: File) => {
      if (!ACCEPTED_SET.has(file.type)) {
        setStatus({ kind: "error", message: "Use a PNG, JPEG, or WebP file." });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setStatus({ kind: "error", message: "File exceeds 10 MB limit." });
        return;
      }

      const tStart = performance.now();
      try {
        // Phase 1: ensure model + WASM are loaded.
        if (!preloadPromise) {
          setStatus({ kind: "loadingModel", progress: 0 });
          await warmupModel((pct) =>
            setStatus({ kind: "loadingModel", progress: pct }),
          );
        } else {
          await preloadPromise;
        }
        const tModelReady = performance.now();

        // Phase 2: run bg-removal locally. The library doesn't emit progress
        // during inference, so we just show a spinner here.
        setStatus({ kind: "removingBackground" });
        const mod = await loadImgly();
        const transparent = await mod.removeBackground(file, {
          model: "isnet_quint8",
          output: { format: "image/png" },
        });
        const tBgDone = performance.now();

        // Phase 3: upload the transparent PNG. Server flips + stores.
        setStatus({ kind: "uploading", progress: 0 });
        const baseName = file.name.replace(/\.[^.]+$/, "") + ".png";
        const json = await uploadWithProgress(
          transparent,
          baseName,
          (pct) => setStatus({ kind: "uploading", progress: pct }),
          () => setStatus({ kind: "processing" }),
        );
        const tUploadDone = performance.now();

        // Mirror the server's [perf] line so we have client-side numbers in
        // DevTools alongside the Vercel server logs.
        console.info(
          `[perf-client] upload modelLoad=${Math.round(tModelReady - tStart)}ms ` +
            `bgRemove=${Math.round(tBgDone - tModelReady)}ms ` +
            `upload+server=${Math.round(tUploadDone - tBgDone)}ms ` +
            `total=${Math.round(tUploadDone - tStart)}ms ` +
            `inBytes=${file.size} outBytes=${transparent.size}`,
        );

        if (!json.ok) {
          setStatus({ kind: "error", message: json.error.message });
          return;
        }
        router.push(`/i/${json.data.id}`);
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [router],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void upload(file);
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  };

  const statusText =
    status.kind === "loadingModel"
      ? `Loading background-removal model… ${status.progress}%`
      : status.kind === "removingBackground"
        ? PROCESSING_MESSAGES[messageIndex]
        : status.kind === "uploading"
          ? `Uploading ${status.progress}%`
          : status.kind === "processing"
            ? "Flipping & saving\u2026"
            : "";

  return (
    <div className="w-full flex flex-col gap-6">
      <label
        onPointerEnter={onIntent}
        onFocus={onIntent}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) {
            onIntent();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`upload-zone focus-ring-within flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center bg-surface-container-lowest ${
          busy
            ? "is-busy border-outline-variant cursor-wait"
            : dragOver
              ? "is-drag border-primary cursor-copy"
              : "border-primary/30 cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          disabled={busy}
          onChange={onFileChange}
        />
        {busy ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <Spinner />
            <span className="text-sm text-on-surface-variant">{statusText}</span>
            {(status.kind === "uploading" ||
              status.kind === "loadingModel") && (
              <div
                className="w-full max-w-xs h-1.5 rounded-full bg-surface-container overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={status.progress}
                aria-label={
                  status.kind === "loadingModel"
                    ? "Model load progress"
                    : "Upload progress"
                }
              >
                <div
                  className="h-full bg-primary transition-[width] duration-150"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-full bg-primary-fixed p-5 text-primary">
              <UploadIcon />
            </div>
            <span className="text-xl font-bold text-on-surface">
              {dragOver ? "Drop to upload" : "Drop your image here"}
            </span>
            <span className="text-sm text-on-surface-variant">
              or click to browse
            </span>
            <span
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-[0_4px_0_0_var(--color-primary-press)] transition-all active:translate-y-[2px] active:shadow-none"
              aria-hidden="true"
            >
              Choose image
            </span>
            <span className="mt-2 text-xs text-on-surface-variant">
              PNG, JPEG, or WebP · up to 10 MB · processed in your browser
            </span>
          </>
        )}
      </label>

      {/* Polite live region so screen readers announce phase changes. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {statusText}
      </div>

      {status.kind === "error" && (
        <div
          role="alert"
          className="rounded-lg border border-error bg-error-container px-4 py-3 text-sm text-on-error-container"
        >
          <strong className="font-semibold">Upload failed:</strong>{" "}
          {status.message}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-6 w-6 animate-spin text-primary"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      className="h-10 w-10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
      />
    </svg>
  );
}
