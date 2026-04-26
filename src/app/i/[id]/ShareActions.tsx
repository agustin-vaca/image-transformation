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
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Auto-deletes in{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {formatRemaining(remaining)}
          </span>
        </span>
        <span title={tzLabel}>
          {expiryLocal} <span className="text-zinc-400">({tzLabel})</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyShareLink}
          className="flex-1 min-w-[8rem] rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {copied ? "Copied!" : "Copy share link"}
        </button>
        {expired ? (
          <button
            type="button"
            disabled
            className="flex-1 min-w-[8rem] rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-900 transition disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-100"
          >
            Download
          </button>
        ) : (
          <a
            href={downloadHref}
            className="flex-1 min-w-[8rem] rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Download
          </a>
        )}
        <button
          type="button"
          onClick={() => void deleteImage()}
          disabled={deleting}
          className="flex-1 min-w-[8rem] rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
        >
          {deleting ? "Deleting…" : "Delete now"}
        </button>
      </div>
      <Link
        href="/"
        className="text-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← Transform another image
      </Link>
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
