"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

/**
 * Map common getUserMedia DOMException names to a one-liner the user can
 * actually act on. Falls back to the raw message for unknown errors.
 */
function friendlyCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera permission was denied. Allow access in your browser, or use the file picker instead.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No camera was found on this device. Use the file picker instead.";
      case "NotReadableError":
        return "Your camera is busy in another app. Close it and try again.";
      case "AbortError":
        return "Camera start was interrupted. Try again.";
    }
  }
  return err instanceof Error ? err.message : "Could not access the camera";
}

/**
 * Live-camera capture modal. Uses getUserMedia for a video preview, then
 * grabs a single frame onto a canvas and emits it as a JPEG File so it can
 * flow through the same upload pipeline as a picked file.
 *
 * On devices without camera access (or when the user denies it) we surface
 * the error and keep the modal open so the caller can fall back to the
 * native file picker.
 */
export function CameraModal({ open, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // Reset inside the async (not the effect body) to satisfy the
      // react-hooks/set-state-in-effect rule; this still runs synchronously
      // on the same tick as the effect.
      if (cancelled) return;
      setError(null);
      setReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // Some browsers resolve play() before any frame has decoded, so a
          // capture fired immediately after would draw a black canvas. Wait
          // for the first frame (readyState >= HAVE_CURRENT_DATA = 2) before
          // marking the modal as ready.
          await video.play().catch(() => undefined);
          if (video.readyState < 2) {
            await new Promise<void>((resolve) => {
              const done = () => {
                video.removeEventListener("loadeddata", done);
                resolve();
              };
              video.addEventListener("loadeddata", done, { once: true });
            });
          }
          if (!cancelled) setReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        setError(friendlyCameraError(err));
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        stop();
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture, ready, stop]);

  // Close on Escape for keyboard parity with native dialogs.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-4 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-on-surface">Take a photo</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-on-surface-variant hover:bg-surface-container"
            aria-label="Close camera"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-error bg-error-container px-4 py-3 text-sm text-on-error-container"
          >
            {error}
          </div>
        ) : (
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                Starting camera…
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={!ready || !!error}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_0_0_var(--color-primary-press)] transition-all active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}
