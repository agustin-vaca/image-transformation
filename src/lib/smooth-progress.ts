// Drives a 0..100 progress bar from a single time-based estimator.
//
// Background: the underlying transformers.js / R2 pipeline emits very
// uneven progress events — model + WASM downloads come in big chunks,
// inference is silent, and the R2 PUT usually finishes in under a second
// so XHR progress events arrive in a burst at the very end. Driving the
// bar from those uneven streams directly produces the "stuck at 60% then
// sprint to 100" feel.
//
// Design: ONE continuous, monotonic climb across the whole pipeline.
// - Caller declares `totalEtaMs` up front (sum of typical phase durations,
//   tracked by `PhaseEtaTracker`).
// - The bar climbs linearly from 0 toward `SOFT_CAP` (95%) over the ETA.
// - If the work outlives the ETA, the bar SLOWLY creeps from `SOFT_CAP`
//   toward `HARD_CAP` (99%) using exponential decay so it visibly keeps
//   moving without ever reaching 100% prematurely. (Idling flat at 95%
//   reads as "stuck"; cold first-visit downloads routinely overrun the
//   default ETA, so we need to keep the bar alive.)
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

const SOFT_CAP = 95; // end of the linear-climb phase
const HARD_CAP = 99; // asymptote of the creep phase
// Per-second fraction of the remaining gap to HARD_CAP that the creep
// phase covers. ~3% means: at 95% it advances ~0.12%/s, at 98% ~0.03%/s
// — fast enough to feel alive, slow enough not to pin against 99% in a
// few seconds.
const CREEP_RATE_PER_SEC = 0.03;

export function createSmoothProgress(
  onChange: (pct: number) => void,
): SmoothProgress {
  let value = 0;
  let totalEtaMs = 1;
  let startedAt = 0;
  let lastTickAt = 0;
  let raf = 0;
  let lastEmitted = -1;

  function emit() {
    const rounded = Math.round(value);
    if (rounded === lastEmitted) return;
    lastEmitted = rounded;
    onChange(rounded);
  }

  function tick() {
    raf = 0;
    const now = performance.now();
    const elapsed = now - startedAt;
    const dt = Math.max(0, now - lastTickAt) / 1000;
    lastTickAt = now;

    if (value < SOFT_CAP) {
      const linear = Math.min(SOFT_CAP, (elapsed / totalEtaMs) * SOFT_CAP);
      if (linear > value) value = linear;
    } else if (value < HARD_CAP) {
      // Exponential approach: dv/dt = (HARD_CAP - v) * rate.
      const next = value + (HARD_CAP - value) * CREEP_RATE_PER_SEC * dt;
      if (next > value) value = Math.min(HARD_CAP, next);
    }
    emit();

    // Stop the rAF loop once the *displayed* (rounded) value has reached
    // HARD_CAP — there's no more visible movement until `complete()` snaps
    // to 100%, so spinning at 60fps would just burn CPU/battery for the
    // ~2 minutes it would take `value` to asymptote within 0.01 of HARD_CAP.
    if (lastEmitted < HARD_CAP) {
      raf = requestAnimationFrame(tick);
    }
  }

  return {
    start(ms: number) {
      totalEtaMs = Math.max(1, ms);
      startedAt = performance.now();
      lastTickAt = startedAt;
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
