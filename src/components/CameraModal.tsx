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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const captureBtnRef = useRef<HTMLButtonElement | null>(null);
  // True only between the user clicking Capture and the toBlob callback
  // resolving. Lets us bail out if the modal closes mid-encode so we don't
  // emit a file the user already dismissed.
  const captureLiveRef = useRef(false);
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
          let playFailed = false;
          await video.play().catch(() => {
            playFailed = true;
          });
          // Wait for actual frames before enabling Capture. videoWidth > 0
          // is the canonical "have a paintable frame" signal; readyState
          // alone isn't enough on some browsers, and play() can resolve
          // before frames exist.
          if (!cancelled && (playFailed || !video.videoWidth)) {
            await new Promise<void>((resolve) => {
              const done = () => {
                video.removeEventListener("loadeddata", done);
                video.removeEventListener("canplay", done);
                resolve();
              };
              video.addEventListener("loadeddata", done, { once: true });
              video.addEventListener("canplay", done, { once: true });
              // Some browsers fire neither if play() failed; poll once a
              // frame as a last resort.
              const poll = () => {
                if (cancelled) return;
                if (video.videoWidth > 0 && video.readyState >= 2) done();
                else requestAnimationFrame(poll);
              };
              requestAnimationFrame(poll);
            });
          }
          if (cancelled) return;
          if (!video.videoWidth || video.readyState < 2) {
            setError(
              "Camera started but no video frames are available. Try again or use the file picker.",
            );
            return;
          }
          setReady(true);
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
    captureLiveRef.current = true;
    canvas.toBlob(
      (blob) => {
        // The modal may have been closed (Cancel/Escape/backdrop) between
        // the click and the encode finishing; if so, don't start an upload
        // the user has already dismissed.
        if (!captureLiveRef.current) return;
        captureLiveRef.current = false;
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

  // Close on Escape for keyboard parity with native dialogs. Also invalidate
  // any in-flight capture so a late toBlob callback doesn't fire onCapture.
  useEffect(() => {
    if (!open) {
      captureLiveRef.current = false;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      captureLiveRef.current = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Focus management: restore focus to the element that opened the modal
  // when it closes, and trap Tab inside the dialog while open.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    // Move focus to the primary action so keyboard users can capture
    // immediately once Capture becomes enabled.
    const focusTarget = captureBtnRef.current ?? dialogRef.current;
    focusTarget?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

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
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-4 shadow-2xl flex flex-col gap-4 outline-none"
      >
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
            ref={captureBtnRef}
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
