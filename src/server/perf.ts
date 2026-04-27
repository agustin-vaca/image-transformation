/**
 * Debug / diagnostic tool — NOT part of the product surface.
 *
 * Tiny perf helper: measures async stages and logs one structured line per
 * request so we can eyeball where time goes in production. It has no effect
 * on responses and is safe to leave wired in; remove the `new PerfTimer(...)`
 * + `.stage(...)` + `.log(...)` calls in a route if you want to silence it.
 *
 * Usage:
 *   const t = new PerfTimer("images.POST");
 *   const buf = await t.stage("parseForm", () => request.formData());
 *   ...
 *   t.log({ inputBytes, outputBytes });
 *
 * In Vercel logs, filter on `[perf]` to compare runs and spot the dominant stage.
 */
export class PerfTimer {
  private readonly startedAt = performance.now();
  private readonly stages: Record<string, number> = {};

  constructor(private readonly label: string) {}

  async stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.stages[name] = Math.round(performance.now() - start);
    }
  }

  log(extra: Record<string, string | number> = {}): void {
    const total = Math.round(performance.now() - this.startedAt);
    const parts = Object.entries(this.stages).map(([k, v]) => `${k}=${v}ms`);
    const extras = Object.entries(extra).map(([k, v]) => `${k}=${v}`);
    console.log(
      `[perf] ${this.label} ${parts.join(" ")} total=${total}ms ${extras.join(" ")}`.trim(),
    );
  }
}
