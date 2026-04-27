"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse, ImageDTO } from "@/lib/api";
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/api";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number } // 0..100, real bytes from XHR
  | { kind: "processing" } // upload done; server doing bg-removal + flip
  | { kind: "error"; message: string };

const ACCEPTED = ACCEPTED_MIME_TYPES.join(",");
const ACCEPTED_SET = new Set<string>(ACCEPTED_MIME_TYPES);

// Rotating one-liners shown while the server does bg-removal + flip.
// Order is shuffled per-mount so reloads don't always start with the same line.
const PROCESSING_MESSAGES: ReadonlyArray<string> = [
  "Removing background & flipping\u2026",
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
 * Two-phase upload:
 *   1) "Uploading <pct>%" — driven by real XHR upload progress bytes.
 *   2) "Removing background & flipping…" — request in flight, no client-visible
 *      sub-phases (we don't fake server progress).
 */
function uploadWithProgress(
  file: File,
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
    form.append("file", file);
    xhr.send(form);
  });
}

export function Uploader() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status.kind === "uploading" || status.kind === "processing";

  // Rotate the funny processing messages every MESSAGE_ROTATION_MS while the
  // server is working. The first tick fires immediately and jumps by a random
  // offset so back-to-back uploads feel fresh; subsequent ticks advance one
  // line at a time.
  useEffect(() => {
    if (status.kind !== "processing") return;
    const offset =
      1 + Math.floor(Math.random() * (PROCESSING_MESSAGES.length - 1));
    let step = offset;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + step) % PROCESSING_MESSAGES.length);
      step = 1;
    }, MESSAGE_ROTATION_MS);
    return () => clearInterval(interval);
  }, [status.kind]);

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
      setStatus({ kind: "uploading", progress: 0 });
      try {
        const json = await uploadWithProgress(
          file,
          (pct) => setStatus({ kind: "uploading", progress: pct }),
          () => setStatus({ kind: "processing" }),
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
    // Clear so selecting the same file again still fires onChange.
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
    status.kind === "uploading"
      ? `Uploading ${status.progress}%`
      : status.kind === "processing"
        ? PROCESSING_MESSAGES[messageIndex]
        : "";

  return (
    <div className="w-full flex flex-col gap-6">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
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
            <span className="text-sm text-on-surface-variant">
              {statusText}
            </span>
            {status.kind === "uploading" && (
              <div
                className="w-full max-w-xs h-1.5 rounded-full bg-surface-container overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={status.progress}
                aria-label="Upload progress"
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
              PNG, JPEG, or WebP · up to 10 MB
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
