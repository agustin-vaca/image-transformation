import Link from "next/link";
import { PageShell } from "@/components/PageShell";

export default function ImageNotFound() {
  return (
    <PageShell>
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
    </PageShell>
  );
}
