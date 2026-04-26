import { Uploader } from "@/components/Uploader";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 px-6 py-16 dark:from-zinc-950 dark:to-black sm:py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-10 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            Flip the background out
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400 sm:text-lg">
            Upload an image. We remove the background, flip it horizontally,
            and give you a link that lasts 24 hours.
          </p>
        </div>
        <Uploader />
      </div>
    </main>
  );
}
