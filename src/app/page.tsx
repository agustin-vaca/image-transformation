import { Uploader } from "@/components/Uploader";
import { PageShell } from "@/components/PageShell";

// Funny one-liner captions land under each mirror card.
const MIRROR_CARDS: ReadonlyArray<{
  src: string;
  alt: string;
  caption: string;
}> = [
  {
    src: "/examples/wave.jpg",
    alt: "Portrait of a young man waving cheerfully",
    caption: "Wave at yourself.",
  },
  {
    src: "/examples/cat.jpg",
    alt: "Close-up of a curious ginger cat",
    caption: "Cat staredown.",
  },
  {
    src: "/examples/guitar.jpg",
    alt: "Musician playing an acoustic guitar in a sunlit room",
    caption: "Two-person solo band.",
  },
];

export default function Home() {
  return (
    <PageShell>
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
      <section className="flex flex-col gap-3">
        <Uploader />
        <p
          role="note"
          className="text-sm leading-relaxed text-on-surface-variant"
        >
          <span aria-hidden="true">💡 </span>
          <span className="font-semibold text-on-surface">Pro tip:</span> the
          mirror works best when your subject stands out clearly from the
          background — strong contrast (light subject on dark backdrop, or vice
          versa) gives the cleanest cut-out.
        </p>
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

      {/* Examples — mirror cards (image left, same image flipped right) */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">
            Examples
          </h2>
          <p className="text-sm text-on-surface-variant">
            Original on the left, mirrored twin on the right.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MIRROR_CARDS.map((card) => (
            <li key={card.src} className="flex flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-2xl border border-outline-variant bg-surface-container">
                {/* White divider sits over the seam so the mirror line reads at a glance. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.2)]"
                />
                <div className="flex h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.src}
                    alt={card.alt}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-1/2 object-cover"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.src}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-1/2 object-cover -scale-x-100"
                  />
                </div>
              </div>
              <p className="text-sm font-semibold text-on-surface">
                {card.caption}
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
    </PageShell>
  );
}
