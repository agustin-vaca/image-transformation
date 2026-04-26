import Link from "next/link";

export default function ImageNotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-white dark:bg-black">
      <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-5xl" aria-hidden="true">
          🪄
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Looks like your image got deleted.
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Images on this site auto-delete 24 hours after upload — or whenever
          someone hits the Delete button. Either way, this one&apos;s gone.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Transform another image
        </Link>
      </div>
    </main>
  );
}
