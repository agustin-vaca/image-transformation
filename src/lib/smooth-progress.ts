// Drives a 0..100 progress bar from a single time-based estimator.
//
// Background: imgly's `progress` callback only fires for asset downloads
// (model + WASM). On a warm second upload, `removeBackground` runs purely on
// cached assets and emits ZERO events during inference. And the R2 PUT
// usually finishes in well under a second, so XHR progress events arrive in
// a burst at the very end. Driving the bar from a mix of those uneven event
// streams is what produced the "stuck at 60% then sprint to 100" feel.
//
// Design: ONE continuous, linear climb across the whole pipeline.
// - Caller declares `totalEtaMs` up front (sum of typical phase durations,
//   tracked by `PhaseEtaTracker`).
// - The bar climbs linearly from 0 toward 95% over that span, then idles at
//   95% if the work outlives the ETA.
// - `complete()` snaps the bar to 100% when the entire pipeline is done.
// - Real progress events from individual phases are intentionally NOT used
//   for display — they only feed `PhaseEtaTracker` so the *next* upload's
//   ETA is more accurate. Mixing them into the displayed value creates the
//   exact jumpiness we're trying to avoid.
// - Monotonic: the displayed value never moves backwards.

export interface SmoothProgress {
  /** Begin the linear climb. Bar will reach ~95% after `totalEtaMs`. */
  start(totalEtaMs: number): void;
  /** Snap to 100% and stop. */
  complete(): void;
  /** Stop without snapping (e.g. on error). Safe to call multiple times. */
  stop(): void;
}

const SOFT_CAP = 95; // bar idles here if work outlives the ETA

export function createSmoothProgress(
  onChange: (pct: number) => void,
): SmoothProgress {
  let value = 0;
  let totalEtaMs = 1;
  let startedAt = 0;
  let raf = 0;
  let lastEmitted = -1;

  function emit() {
    const rounded = Math.round(value);
    if (rounded === lastEmitted) return;
    lastEmitted = rounded;
    onChange(rounded);
  }

  function tick() {
    const elapsed = performance.now() - startedAt;
    const linear = Math.min(SOFT_CAP, (elapsed / totalEtaMs) * SOFT_CAP);
    if (linear > value) {
      value = linear;
      emit();
    }
    raf = requestAnimationFrame(tick);
  }

  return {
    start(ms: number) {
      totalEtaMs = Math.max(1, ms);
      startedAt = performance.now();
      value = 0;
      lastEmitted = -1;
      emit();
      if (!raf) raf = requestAnimationFrame(tick);
    },
    complete() {
      value = 100;
      emit();
      this.stop();
    },
    stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}

// Persist a rolling estimate of recent phase durations across uploads so the
// second run uses the first run's actual timing, not a hard-coded guess.
export class PhaseEtaTracker {
  private readonly samples = new Map<string, number>();
  private readonly alpha = 0.4; // EMA weight for the new sample.

  constructor(private readonly defaults: Record<string, number>) {}

  get(key: string): number {
    return this.samples.get(key) ?? this.defaults[key] ?? 1000;
  }

  observe(key: string, durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const prev = this.samples.get(key) ?? this.defaults[key] ?? durationMs;
    const next = prev * (1 - this.alpha) + durationMs * this.alpha;
    this.samples.set(key, next);
  }
}
