"use client";

import { useCallback, useRef, useState } from "react";
import type { ApiResponse, ImageDTO } from "@/lib/api";

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success"; data: ImageDTO }
  | { kind: "error"; message: string };

const ACCEPTED = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

export function Uploader() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) {
      setStatus({ kind: "error", message: "File exceeds 10 MB limit." });
      return;
    }
    setStatus({ kind: "uploading" });
    setCopied(false);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/images", { method: "POST", body: form });
      const json = (await res.json()) as ApiResponse<ImageDTO>;
      if (!json.ok) {
        setStatus({ kind: "error", message: json.error.message });
        return;
      }
      setStatus({ kind: "success", data: json.data });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the value so selecting the same file again still fires onChange
    // (browsers suppress the event when the value is unchanged).
    e.target.value = "";
    if (file) void upload(file);
  };

  const reset = () => {
    setStatus({ kind: "idle" });
    setCopied(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const copyShareLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const downloadImage = async (url: string, filename: string) => {
    // The `download` attribute is ignored cross-origin (R2 is a different host),
    // so fetch the bytes and trigger a programmatic download via a blob URL.
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      {status.kind !== "success" && (
        <label
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition focus-within:outline-none focus-within:ring-2 focus-within:ring-zinc-900 focus-within:ring-offset-2 dark:focus-within:ring-zinc-100 dark:focus-within:ring-offset-black ${
            status.kind === "uploading"
              ? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 cursor-wait"
              : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900 cursor-pointer"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            disabled={status.kind === "uploading"}
            onChange={onFileChange}
          />
          {status.kind === "uploading" ? (
            <>
              <Spinner />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Processing your image…
              </span>
            </>
          ) : (
            <>
              <UploadIcon />
              <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                Click to upload an image
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-500">
                PNG, JPEG, or WebP · up to 10 MB
              </span>
            </>
          )}
        </label>
      )}

      {status.kind === "error" && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <strong className="font-semibold">Upload failed:</strong>{" "}
          {status.message}
        </div>
      )}

      {status.kind === "success" && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={status.data.previewUrl}
            alt={status.data.filename}
            className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-900"
          />
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-zinc-500 truncate">
                {status.data.filename}
              </span>
              <span className="text-xs text-zinc-500">
                expires {new Date(status.data.expiresAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyShareLink(status.data.shareUrl)}
                className="flex-1 min-w-[8rem] rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {copied ? "Copied!" : "Copy share link"}
              </button>
              <a
                href={status.data.previewUrl}
                download={status.data.filename}
                onClick={(e) => {
                  e.preventDefault();
                  void downloadImage(status.data.previewUrl, status.data.filename);
                }}
                className="flex-1 min-w-[8rem] rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Download
              </a>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Upload another
              </button>
            </div>
          </div>
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
        d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
      />
    </svg>
  );
}
