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
import { createSmoothProgress, PhaseEtaTracker } from "@/lib/smooth-progress";
import { CameraModal } from "@/components/CameraModal";

type Stage = "warmup" | "removing" | "uploading";

type Status =
  | { kind: "idle" }
  | { kind: "processing"; progress: number; stage: Stage }
  | { kind: "error"; message: string };

const ACCEPTED = ACCEPTED_MIME_TYPES.join(",");
const ACCEPTED_SET = new Set<string>(ACCEPTED_MIME_TYPES);

// One list per pipeline stage. The headline rotates within the active
// stage's list, so the copy actually tracks what the app is doing
// (warming up the model, running bg-removal, or uploading to R2). Each
// list mixes a plain "what’s happening" line with sillier ones so the
// user always gets a hint of the real state.
const STAGE_MESSAGES: Record<Stage, ReadonlyArray<string>> = {
  warmup: [
    "Waking up the AI\u2026",
    "Downloading tiny brains\u2026",
    "Pouring espresso for the model\u2026",
    "Loading neural network\u2026",
    "Booting up the pixel wizard\u2026",
    "Stretching before the heavy lifting\u2026",
  ],
  removing: [
    "Removing background\u2026",
    "Asking the background to please leave\u2026",
    "Negotiating with stubborn pixels\u2026",
    "Teaching pixels to face the other way\u2026",
    "Holding up a tiny mirror\u2026",
    "Convincing photons to swap sides\u2026",
    "Yelling \u2018left is the new right\u2019\u2026",
    "Cutting you out of the scene\u2026",
    "Erasing everything that isn\u2019t you\u2026",
  ],
  uploading: [
    "Uploading your image\u2026",
    "Beaming pixels to the cloud\u2026",
    "Mailing your photo to the internet\u2026",
    "Finding a good URL for it\u2026",
    "Tucking your image into storage\u2026",
    "Almost there. Probably.\u2026",
  ],
};
const MESSAGE_ROTATION_MS = 2500;

// Plain-English label per stage for the screen-reader live region. Kept
// separate from the funny rotating copy so assistive tech gets a stable,
// informative phrase exactly when the pipeline advances (and not on every
// percentage tick or every 2.5s when the headline rotates).
const STAGE_ANNOUNCEMENTS: Record<Stage, string> = {
  warmup: "Loading background-removal model.",
  removing: "Removing background and flipping image.",
  uploading: "Uploading image.",
};

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
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload rejected (status ${xhr.status})`));
    };
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
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

// Module-level so the second upload's ETAs come from the first upload's
// measured wall-clock times instead of these defaults.
const phaseEta = new PhaseEtaTracker({
  // Cold-visit budget includes the ~12 MB MODNet model + ~10 MB of
  // onnxruntime-web WASM. Realistic on broadband is ~6–10 s. Underestimating
  // here is what made the bar feel stuck near the end on a fresh visit; the
  // smooth-progress creep phase covers any remaining slop, and the EMA
  // tightens the estimate on every subsequent upload.
  model: 8000,
  bgRemove: 1500, // MODNet inference: ~0.3s WebGPU / ~1.5s WASM, EMA adapts
  upload: 1500, // 0.5–1 MB PNG to R2 over typical home broadband
});

export function Uploader() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Track the in-flight upload so we can stop the rAF loop and abort the
  // XHR if the component unmounts mid-upload (route change, parent
  // remount, etc.). Without this React would warn about setStatus on an
  // unmounted component and the XHR would continue uselessly in the
  // background.
  const activeSmoothRef = useRef<{ stop: () => void } | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      activeSmoothRef.current?.stop();
      activeAbortRef.current?.abort();
    },
    [],
  );
  const busy = status.kind === "processing";
  const stage: Stage | null = status.kind === "processing" ? status.stage : null;

  // Rotate within the current stage's list on a timer. The fresh starting
  // index for each stage is seeded by `upload` (an event handler) when it
  // transitions stages, so we don't need to call setState during render or
  // inside this effect on mount.
  useEffect(() => {
    if (!stage) return;
    const list = STAGE_MESSAGES[stage];
    if (list.length <= 1) return;
    const step = 1 + Math.floor(Math.random() * (list.length - 1));
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + step) % list.length);
    }, MESSAGE_ROTATION_MS);
    return () => clearInterval(interval);
  }, [stage]);

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

      // Drive the bar from a single time-based estimator. Real progress
      // events from the underlying phases are intentionally NOT used for
      // display — they only feed `phaseEta` so the next upload's ETA is
      // more accurate. Mixing them in is what produced the "stuck at 60%
      // then sprint to 100" feel; one continuous linear climb feels more
      // natural even if the timing is approximate.
      const modelAlreadyWarm = getPreloadProgress() >= 100;
      const totalEta =
        (modelAlreadyWarm ? 0 : phaseEta.get("model")) +
        phaseEta.get("bgRemove") +
        phaseEta.get("upload");
      // Track the current stage independently of the bar so the headline
      // reflects what is actually happening in the pipeline (warmup ->
      // removing -> uploading) instead of just a percentage. The bar's
      // value is mirrored in a local so stage transitions can re-emit
      // status without reading stale React state.
      let currentStage: Stage = modelAlreadyWarm ? "removing" : "warmup";
      let currentProgress = 0;
      const emit = () =>
        setStatus({
          kind: "processing",
          progress: currentProgress,
          stage: currentStage,
        });
      const enterStage = (next: Stage) => {
        currentStage = next;
        // Seed a random starting message for the new stage's list so the
        // headline visibly turns over the moment the pipeline advances.
        setMessageIndex(
          Math.floor(Math.random() * STAGE_MESSAGES[next].length),
        );
        emit();
      };
      const smooth = createSmoothProgress((pct) => {
        currentProgress = pct;
        emit();
      });
      const abort = new AbortController();
      activeSmoothRef.current = smooth;
      activeAbortRef.current = abort;
      smooth.start(totalEta);
      enterStage(currentStage);

      try {
        // Phase 1: model + WASM (worker-hosted; main thread stays free).
        await warmupModel();
        const tModelReady = performance.now();
        if (!modelAlreadyWarm) {
          phaseEta.observe("model", tModelReady - tStart);
        }
        if (currentStage === "warmup") {
          enterStage("removing");
        }

        // Phase 2: decode + flip + downscale on main thread (cheap, ~10ms),
        // then ship the encoded PNG into the worker for bg-removal.
        const { canvas, originalW, originalH } = await decodeFlipDownscale(file);
        const flippedBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("Canvas encode failed"))),
            "image/png",
          );
        });
        const transparent = await removeBackgroundInWorker(flippedBlob);
        const tBgDone = performance.now();
        phaseEta.observe("bgRemove", tBgDone - tModelReady);
        enterStage("uploading");

        // Phase 3: ask the server for a presigned PUT URL, then upload the
        // bytes directly to R2.
        const baseName = file.name.replace(/\.[^.]+$/, "") + ".png";
        const signed = await requestSignedUpload(baseName, transparent.size);
        await uploadToR2WithProgress(
          signed.upload.url,
          signed.upload.headers,
          transparent,
          () => {
            /* upload progress events ignored for display — see comment above */
          },
          abort.signal,
        );
        smooth.complete();
        const tUploadDone = performance.now();
        phaseEta.observe("upload", tUploadDone - tBgDone);

        // Debug/diagnostic only — a single `[perf-client]` log line per upload
        // so we can eyeball model-load vs bg-removal vs upload time in DevTools.
        // Has no effect on the user-visible flow.
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
        smooth.stop();
        if (err instanceof DOMException && err.name === "AbortError") {
          // Component unmounted mid-upload — nothing to surface.
          return;
        }
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      } finally {
        if (activeSmoothRef.current === smooth) activeSmoothRef.current = null;
        if (activeAbortRef.current === abort) activeAbortRef.current = null;
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
    // getUserMedia is only available in secure contexts (HTTPS or localhost).
    // Anything else (e.g. an http://192.168.x.x preview on a LAN) silently
    // returns no `mediaDevices`; fall back to the native camera input there.
    const hasGetUserMedia =
      typeof navigator !== "undefined" &&
      typeof window !== "undefined" &&
      window.isSecureContext &&
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

  // The headline rotates within the current stage's message list so the
  // copy reflects what the pipeline is actually doing (warming up the
  // model, removing the background, or uploading). The single bar below
  // (0→100% across all stages, time-driven) is unaffected by which list
  // is active.
  const stageList = stage ? STAGE_MESSAGES[stage] : null;
  const headline =
    stageList && stageList.length > 0
      ? (stageList[messageIndex % stageList.length] ?? stageList[0] ?? "")
      : "";
  const progress = status.kind === "processing" ? status.progress : 0;

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
            <div
              className="w-full max-w-xs h-1.5 rounded-full bg-surface-container overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Processing progress"
            >
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-on-surface-variant">{progress}%</span>
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
        disabled={busy}
        onChange={onFileChange}
      />

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={onCameraCapture}
      />

      {/* Announce only stage transitions (warmup -> removing -> uploading)
          rather than the rotating funny headline or every percentage change.
          Otherwise screen readers get spammed every 2.5s by the rotating
          copy and on every progress emit. `STAGE_ANNOUNCEMENTS` keeps the
          phrase plain (no jokes) so the announcement is informative. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {stage ? STAGE_ANNOUNCEMENTS[stage] : ""}
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
