import { notFound } from "next/navigation";
import Link from "next/link";
import { getEnv } from "@/server/env";
import { createR2StorageFromEnv } from "@/server/storage/r2";
import { ApiError, ErrorCodes } from "@/server/errors";
import { DownloadButton } from "./DownloadButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ImagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) notFound();

  const env = getEnv();
  const storage = createR2StorageFromEnv(env);

  try {
    const result = await storage.get(id);
    // Drain the stream we don't need; we only used get() as an existence probe.
    await result.stream.cancel();
  } catch (err) {
    if (err instanceof ApiError && err.code === ErrorCodes.NOT_FOUND) {
      notFound();
    }
    throw err;
  }

  const publicUrl = `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/images/${id}`;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-white dark:bg-black">
      <div className="w-full max-w-2xl flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={publicUrl}
          alt="Shared image"
          className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-900"
        />
        <div className="flex flex-wrap gap-2">
          <DownloadButton
            url={publicUrl}
            filename={`image-${id}.png`}
            className="flex-1 min-w-[8rem] rounded-lg bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          />
          <Link
            href="/"
            className="flex-1 min-w-[8rem] rounded-lg border border-zinc-300 px-4 py-2 text-center text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Transform another
          </Link>
        </div>
      </div>
    </main>
  );
}
