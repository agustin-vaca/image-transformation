"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ApiResponse } from "@/lib/api";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  }
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function ShareActions({
  id,
  shareUrl,
  expiresAtIso,
}: {
  id: string;
  shareUrl: string;
  expiresAtIso: string;
}) {
  const router = useRouter();
  const expiresAt = new Date(expiresAtIso).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lazy init so SSR uses "UTC"; client uses the browser's IANA zone.
  const [timeZone] = useState(() =>
    typeof window === "undefined" ? "UTC" : resolveTimeZone(),
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = expiresAt - now;
  const expired = remaining <= 0;
  const expiryLocal = new Date(expiresAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const tzLabel = timeZone === "UTC" ? "UTC" : timeZone;

  const copyShareLink = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (insecure context, permissions denied,
      // unsupported browser). Surface it instead of silently swallowing.
      setError("Couldn't copy — select the link manually.");
    }
  };

  const downloadHref = `/api/images/${id}/download`;

  const deleteImage = async () => {
    if (!confirm("Delete this image? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!json.ok) {
        setError(json.error.message);
        setDeleting(false);
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between text-xs text-on-surface-variant">
        <span>
          Auto-deletes in{" "}
          <span className="font-mono text-on-surface">
            {formatRemaining(remaining)}
          </span>
        </span>
        <span title={tzLabel}>
          {expiryLocal}{" "}
          <span className="text-outline">({tzLabel})</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyShareLink}
          className="focus-ring flex-1 min-w-[8rem] rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_0_0_var(--color-primary-press)] transition-all active:translate-y-[2px] active:shadow-none hover:bg-primary-hover"
        >
          {copied ? "Copied!" : "Copy share link"}
        </button>
        {expired ? (
          <button
            type="button"
            disabled
            className="flex-1 min-w-[8rem] rounded-lg border border-outline-variant px-4 py-2.5 text-center text-sm font-semibold text-on-surface-variant disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download
          </button>
        ) : (
          <a
            href={downloadHref}
            className="focus-ring flex-1 min-w-[8rem] rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-center text-sm font-semibold text-on-surface transition hover:bg-surface-container-low"
          >
            Download
          </a>
        )}
        <button
          type="button"
          onClick={() => void deleteImage()}
          disabled={deleting}
          className="focus-ring flex-1 min-w-[8rem] rounded-lg border border-error px-4 py-2.5 text-sm font-semibold text-error transition hover:bg-error-container disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deleting ? "Deleting…" : "Delete now"}
        </button>
      </div>
      <Link
        href="/"
        className="text-center text-xs font-medium text-on-surface-variant transition hover:text-primary"
      >
        ← Transform another image
      </Link>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-error bg-error-container px-3 py-2 text-xs text-on-error-container"
        >
          {error}
        </div>
      )}
    </div>
  );
}
