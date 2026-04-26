import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEnv } from "@/server/env";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { computeExpiresAt, isExpired } from "@/server/expiry";
import { ApiError, ErrorCodes } from "@/server/errors";
import { IMAGE_ID_RE } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { ShareActions } from "./ShareActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!IMAGE_ID_RE.test(id)) return {};
  const env = getEnv();
  const publicUrl = `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/images/${id}`;
  // Use the validated APP_BASE_URL so the canonical share URL can't be
  // spoofed via Host / X-Forwarded-Proto headers behind a misconfigured
  // proxy.
  const shareUrl = `${env.APP_BASE_URL.replace(/\/+$/, "")}/i/${id}`;
  const title = "Your mirror is ready · MirrorMe";
  const description =
    "Background removed and horizontally flipped. Auto-deletes 24 hours after upload.";
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: shareUrl,
      images: [{ url: publicUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [publicUrl],
    },
  };
}

export default async function ImagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!IMAGE_ID_RE.test(id)) notFound();

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
  const shareUrl = `${env.APP_BASE_URL.replace(/\/+$/, "")}/i/${id}`;

  return (
    <PageShell>
      <header className="flex flex-col gap-4">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-on-surface sm:text-5xl">
          Done. Here&apos;s your mirror.
        </h1>
        <p className="text-lg leading-relaxed text-on-surface-variant">
          Background removed. Flipped horizontally. Auto-deletes 24 hours
          after upload.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={publicUrl}
          alt="Your transformed image, background removed and flipped horizontally"
          className="checker w-full rounded-xl"
        />
        <ShareActions
          id={id}
          shareUrl={shareUrl}
          expiresAtIso={expiresAt.toISOString()}
        />
      </section>
    </PageShell>
  );
}
