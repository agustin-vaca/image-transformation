import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getEnv } from "@/server/env";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { computeExpiresAt, isExpired } from "@/server/expiry";
import { ApiError, ErrorCodes } from "@/server/errors";
import { ShareActions } from "./ShareActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export default async function ImagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!ID_RE.test(id)) notFound();

  const env = getEnv();
  const storage = createR2StorageFromEnv(env);

  let lastModified: Date;
  try {
    const meta = await storage.head(id);
    lastModified = meta.lastModified;
  } catch (err) {
    if (err instanceof ApiError && err.code === ErrorCodes.NOT_FOUND) {
      notFound();
    }
    throw err;
  }

  const expiresAt = computeExpiresAt(lastModified);
  if (isExpired(expiresAt)) notFound();

  const publicUrl = `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/images/${id}`;
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const shareUrl = `${proto}://${host}/i/${id}`;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-white dark:bg-black">
      <div className="w-full max-w-2xl flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={publicUrl}
          alt="Shared image"
          className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-900"
        />
        <ShareActions
          id={id}
          publicUrl={publicUrl}
          shareUrl={shareUrl}
          expiresAtIso={expiresAt.toISOString()}
        />
      </div>
    </main>
  );
}
