import Link from "next/link";
import { Uploader } from "@/components/Uploader";

// Funny "You can…" examples — keep tight, one line each.
// Each card frames the value prop concretely so it's obvious *why*
// you'd want a horizontally-flipped, background-removed cutout.
const EXAMPLES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Wave at yourself.",
    body: "Make a guy say hi to himself.",
  },
  {
    title: "Cat staredown.",
    body: "Stage a face-off between a cat and… the same cat.",
  },
  {
    title: "Two-person solo band.",
    body: "Build a duet where both members are you.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <div className="mx-auto flex max-w-[720px] flex-col gap-12 px-8 py-8 sm:py-12">
        {/* Wordmark */}
        <nav className="flex items-center justify-between">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-primary"
          >
            MirrorMe
          </Link>
        </nav>

        {/* Hero */}
        <header className="flex flex-col gap-4">
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-on-surface sm:text-6xl">
            Say hi to yourself.
          </h1>
          <p className="max-w-[540px] text-lg leading-relaxed text-on-surface-variant">
            Drop in a photo. We remove the background and flip it horizontally.
            That&apos;s it.
          </p>
        </header>

        {/* Upload */}
        <section>
          <Uploader />
        </section>

        {/* Steps */}
        <section className="grid grid-cols-1 gap-6">
          {[
            {
              n: "01",
              h: "Upload",
              p: "Pick a file from your device or drop it in.",
            },
            {
              n: "02",
              h: "We mirror it",
              p: "Background removed and flipped instantly.",
            },
            {
              n: "03",
              h: "Share or download",
              p: "Get your high-res file or a 24h temporary link.",
            },
          ].map((step) => (
            <div key={step.n} className="flex items-start gap-6">
              <span className="mt-1 font-mono text-sm font-semibold tracking-wider text-primary">
                {step.n}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold tracking-wide text-on-surface">
                  {step.h}
                </h3>
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  {step.p}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Examples — funny "You can…" cards */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-tight text-on-surface">
              You can…
            </h2>
            <p className="text-sm text-on-surface-variant">
              A few things this is genuinely good for.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {EXAMPLES.map((ex) => (
              <li
                key={ex.title}
                className="flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
              >
                <h3 className="text-sm font-semibold text-on-surface">
                  {ex.title}
                </h3>
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  {ex.body}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm italic leading-relaxed text-on-surface-variant">
            You&apos;ll need other software to actually combine the two images
            into one scene — but that&apos;s a different story. This is about{" "}
            <strong className="font-semibold text-on-surface">your</strong>{" "}
            story, and how you&apos;ll write it with{" "}
            <strong className="font-semibold text-primary">MirrorMe</strong>.
          </p>
        </section>

        {/* Footer */}
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
