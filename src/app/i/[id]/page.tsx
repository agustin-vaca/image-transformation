import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/server/env";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { computeExpiresAt, isExpired } from "@/server/expiry";
import { ApiError, ErrorCodes } from "@/server/errors";
import { ShareActions } from "./ShareActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!ID_RE.test(id)) return {};
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
  const shareUrl = `${env.APP_BASE_URL.replace(/\/+$/, "")}/i/${id}`;

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <div className="mx-auto flex max-w-[720px] flex-col gap-12 px-8 py-8 sm:py-12">
        <nav className="flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-primary"
          >
            MirrorMe
          </Link>
        </nav>

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

        <footer className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-outline-variant pt-6 text-sm text-on-surface-variant sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-on-surface">MirrorMe</span>
            <span className="opacity-50">•</span>
            <span>Auto-deletes 24 hours after upload</span>
          </div>
          <a
            href="https://github.com/agustin-vaca/image-transformation"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
          >
            GitHub
          </a>
        </footer>
      </div>
    </main>
  );
}
