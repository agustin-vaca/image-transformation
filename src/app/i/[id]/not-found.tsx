import Link from "next/link";

export default function ImageNotFound() {
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
            Pixels on the run.
          </h1>
          <p className="text-lg leading-relaxed text-on-surface-variant">
            Looks like your image got deleted. Images on MirrorMe auto-delete
            24 hours after upload — or whenever someone hits the Delete button.
            Either way, this one&apos;s gone.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Want a new mirror? Drop a fresh image and we&apos;ll do it again.
          </p>
          <Link
            href="/"
            className="focus-ring inline-flex w-fit items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-[0_4px_0_0_var(--color-primary-press)] transition-all active:translate-y-[2px] active:shadow-none hover:bg-primary-hover"
          >
            Back to upload
          </Link>
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
