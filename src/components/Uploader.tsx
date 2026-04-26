"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse, ImageDTO } from "@/lib/api";

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number } // 0..100, real bytes from XHR
  | { kind: "processing" } // upload done; server doing bg-removal + flip
  | { kind: "error"; message: string };

const ACCEPTED = "image/png,image/jpeg,image/webp";
const ACCEPTED_SET = new Set(ACCEPTED.split(","));
const MAX_BYTES = 10 * 1024 * 1024;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status.kind === "uploading" || status.kind === "processing";

  const upload = useCallback(
    async (file: File) => {
      if (!ACCEPTED_SET.has(file.type)) {
        setStatus({ kind: "error", message: "Use a PNG, JPEG, or WebP file." });
        return;
      }
      if (file.size > MAX_BYTES) {
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
        ? "Removing background & flipping…"
        : "";

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition focus-within:outline-none focus-within:ring-2 focus-within:ring-zinc-900 focus-within:ring-offset-2 dark:focus-within:ring-zinc-100 dark:focus-within:ring-offset-black ${
          busy
            ? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 cursor-wait"
            : dragOver
              ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900 cursor-copy"
              : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900 cursor-pointer"
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
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {statusText}
            </span>
            {status.kind === "uploading" && (
              <div
                className="w-full max-w-xs h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={status.progress}
                aria-label="Upload progress"
              >
                <div
                  className="h-full bg-zinc-900 dark:bg-zinc-100 transition-[width] duration-150"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <UploadIcon />
            <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              {dragOver ? "Drop to upload" : "Click or drag an image to upload"}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-500">
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
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
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
      className="h-6 w-6 animate-spin text-zinc-500"
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
      className="h-8 w-8 text-zinc-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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
