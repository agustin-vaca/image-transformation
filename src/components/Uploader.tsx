"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse, SignedUploadDTO } from "@/lib/api";
import {
  ACCEPTED_MIME_TYPES,
  CLIENT_MAX_EDGE_PX,
  MAX_UPLOAD_BYTES,
  UPLOAD_MIME_TYPE,
} from "@/lib/api";
import {
  getPreloadProgress,
  removeBackgroundInWorker,
  warmupModel,
} from "@/lib/bg-removal-client";
import { CameraModal } from "@/components/CameraModal";

type Status =
  | { kind: "idle" }
  | { kind: "loadingModel"; progress: number }
  | { kind: "removingBackground" }
  | { kind: "uploading"; progress: number }
  | { kind: "error"; message: string };

const ACCEPTED = ACCEPTED_MIME_TYPES.join(",");
const ACCEPTED_SET = new Set<string>(ACCEPTED_MIME_TYPES);

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

/**
 * Decode the input file, downscale so its longest edge is at most
 * `CLIENT_MAX_EDGE_PX`, and apply a horizontal flip in the same pass.
 * Returns a backing canvas the bg-removal pass can consume directly. Also
 * returns the original decoded dimensions for logging.
 */
async function decodeFlipDownscale(
  file: File,
): Promise<{ canvas: HTMLCanvasElement; originalW: number; originalH: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width: w0, height: h0 } = bitmap;
    const longest = Math.max(w0, h0);
    const scale = longest > CLIENT_MAX_EDGE_PX ? CLIENT_MAX_EDGE_PX / longest : 1;
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    // Horizontal flip is a one-line transform; do it here so the server
    // never has to touch the bytes.
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return { canvas, originalW: w0, originalH: h0 };
  } finally {
    bitmap.close();
  }
}

function uploadToR2WithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload rejected (status ${xhr.status})`));
    };
    xhr.send(body);
  });
}

async function requestSignedUpload(
  filename: string,
  bytes: number,
): Promise<SignedUploadDTO> {
  const res = await fetch("/api/images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, bytes, mime: UPLOAD_MIME_TYPE }),
  });
  const json = (await res.json()) as ApiResponse<SignedUploadDTO>;
  if (!json.ok) throw new Error(json.error.message);
  return json.data;
}

export function Uploader() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * PROCESSING_MESSAGES.length),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const busy =
    status.kind === "loadingModel" ||
    status.kind === "removingBackground" ||
    status.kind === "uploading";

  // Rotate the funny messages for the entire duration of any busy phase
  // (model load, bg removal, upload, save). The list is constant; only the
  // starting index (seeded in `upload`) and step are randomized so consecutive
  // uploads vary.
  useEffect(() => {
    if (!busy) return;
    const step =
      1 + Math.floor(Math.random() * (PROCESSING_MESSAGES.length - 1));
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + step) % PROCESSING_MESSAGES.length);
    }, MESSAGE_ROTATION_MS);
    return () => clearInterval(interval);
  }, [busy]);

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
        setStatus({
          kind: "error",
          message: `File exceeds ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
        });
        return;
      }

      const tStart = performance.now();
      // Seed a fresh random starting message for this upload. Done in the
      // event handler (not in an effect) to avoid a cascading render.
      setMessageIndex(Math.floor(Math.random() * PROCESSING_MESSAGES.length));
      try {
        // Phase 1: model + WASM. Worker-hosted so the main thread stays free
        // to animate the spinner and rotate the messages.
        setStatus({ kind: "loadingModel", progress: getPreloadProgress() });
        await warmupModel((pct) =>
          setStatus({ kind: "loadingModel", progress: pct }),
        );
        const tModelReady = performance.now();

        // Phase 2: decode + flip + downscale on main thread (cheap, ~10ms),
        // then ship the encoded PNG into the worker for bg-removal.
        setStatus({ kind: "removingBackground" });
        const { canvas, originalW, originalH } = await decodeFlipDownscale(file);
        const flippedBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas encode failed"))),
            "image/png",
          );
        });
        const transparent = await removeBackgroundInWorker(flippedBlob);
        const tBgDone = performance.now();

        // Phase 3: ask the server for a presigned PUT URL, then upload the
        // bytes directly to R2.
        setStatus({ kind: "uploading", progress: 0 });
        const baseName = file.name.replace(/\.[^.]+$/, "") + ".png";
        const signed = await requestSignedUpload(baseName, transparent.size);
        await uploadToR2WithProgress(
          signed.upload.url,
          signed.upload.headers,
          transparent,
          (pct) => setStatus({ kind: "uploading", progress: pct }),
        );
        const tUploadDone = performance.now();

        console.info(
          `[perf-client] upload modelLoad=${Math.round(tModelReady - tStart)}ms ` +
            `bgRemove+flip=${Math.round(tBgDone - tModelReady)}ms ` +
            `sign+upload=${Math.round(tUploadDone - tBgDone)}ms ` +
            `total=${Math.round(tUploadDone - tStart)}ms ` +
            `originalSize=${file.size} originalDims=${originalW}x${originalH} ` +
            `outBytes=${transparent.size} outDims=${canvas.width}x${canvas.height}`,
        );

        router.push(signed.image.shareUrl);
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

  // Desktop browsers expose `mediaDevices.getUserMedia` so we can show the
  // live preview modal. Mobile browsers also expose it but the native
  // `<input capture>` flow is more familiar there, so we prefer that when
  // the device has a coarse pointer (touch).
  const onTakePhoto = useCallback(() => {
    if (busy) return;
    onIntent();
    const isCoarse =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches;
    const hasGetUserMedia =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    if (isCoarse || !hasGetUserMedia) {
      cameraInputRef.current?.click();
    } else {
      setCameraOpen(true);
    }
  }, [busy, onIntent]);

  const onCameraCapture = useCallback(
    (file: File) => {
      setCameraOpen(false);
      void upload(file);
    },
    [upload],
  );

  // The headline is always one of the funny rotating messages while busy, so
  // the first upload (which has to download the model) feels the same as any
  // subsequent one. Phase-specific detail (percentages) lives below the bar.
  const headline = busy ? PROCESSING_MESSAGES[messageIndex] : "";
  const subText =
    status.kind === "loadingModel"
      ? `Warming up the model\u2026 ${status.progress}%`
      : status.kind === "uploading"
        ? `Uploading\u2026 ${status.progress}%`
        : "";
  const statusText = subText ? `${headline} \u2014 ${subText}` : headline;

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
            <span
              key={messageIndex}
              className="text-sm text-on-surface animate-in fade-in duration-300"
            >
              {headline}
            </span>
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
            {subText && (
              <span className="text-xs text-on-surface-variant">{subText}</span>
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
              or pick an option below
            </span>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span
                className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-[0_4px_0_0_var(--color-primary-press)] transition-all active:translate-y-0.5 active:shadow-none"
                aria-hidden="true"
              >
                Choose image
              </span>
              <button
                type="button"
                onClick={(e) => {
                  // The label wraps this button; suppress the click that
                  // would otherwise also open the file picker.
                  e.preventDefault();
                  e.stopPropagation();
                  onTakePhoto();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-surface-container px-6 py-3 text-sm font-semibold tracking-wide text-primary transition-all hover:bg-surface-container-high active:translate-y-0.5"
              >
                <CameraIcon />
                Take photo
              </button>
            </div>
            <span className="mt-2 text-xs text-on-surface-variant">
              PNG, JPEG, or WebP · up to 10 MB · processed in your browser
            </span>
          </>
        )}
      </label>

      {/* Mobile fallback: native camera capture via a hidden input. Lives
          outside the drop-zone label so its click never propagates back. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={onFileChange}
      />

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={onCameraCapture}
      />

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

function CameraIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 7h3l2-2h6l2 2h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"
      />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
