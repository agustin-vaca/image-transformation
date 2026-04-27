// Smoothly animates a 0..100 progress value toward a moving target so the UI
// keeps ticking even when the underlying work emits no events.
//
// Why we need it: imgly's `progress` callback only fires for asset downloads
// (model + WASM). On a warm second upload, `removeBackground` runs purely on
// cached assets and emits ZERO events during inference. Without this helper,
// the bar visibly sits at 0% for several seconds and then snaps to 60%.
//
// Strategy:
// - Each phase declares a `[from, to]` slice of the bar and an `etaMs` (a
//   typical wall-clock duration). The animator eases the displayed value
//   toward `to` along an exponential curve calibrated so that ~95% of the
//   slice is covered after `etaMs`. If the phase actually finishes faster,
//   the caller snaps to `to`; if it takes longer, the bar asymptotes near
//   ~99% of the slice (never crosses, never stalls).
// - Real progress events from the underlying work bump the value UP if the
//   estimator is lagging behind reality (e.g. a fast network upload).
// - The displayed value is monotonic — it never moves backwards, so a stale
//   late event can't make the bar look broken.

export interface SmoothProgress {
  /** Begin animating toward `to` over `etaMs`. Snaps the value to `from` first. */
  startPhase(from: number, to: number, etaMs: number): void;
  /** Caller-reported real progress within the current phase, 0..1. */
  reportPhaseProgress(pct01: number): void;
  /** Snap to `to` and stop animating (call when the phase actually completes). */
  endPhase(): void;
  /** Stop the rAF loop. Safe to call multiple times. */
  stop(): void;
}

export function createSmoothProgress(
  onChange: (pct: number) => void,
): SmoothProgress {
  let value = 0; // current displayed value (float, monotonic)
  let phaseFrom = 0;
  let phaseTo = 0;
  let phaseStartedAt = 0;
  let phaseEtaMs = 1;
  let raf = 0;
  let lastEmitted = -1;

  // Eased target: at t=0 we're at `from`; at t=etaMs we've covered ~95% of the
  // slice; thereafter we asymptote to ~99% and let the caller's `endPhase`
  // snap to 100% of the slice when the work actually completes.
  function easedTarget(now: number): number {
    const t = Math.max(0, now - phaseStartedAt);
    // 1 - exp(-3 * t/eta) reaches ~0.95 at t=eta and ~0.993 at t=2*eta.
    const eased = 1 - Math.exp((-3 * t) / Math.max(1, phaseEtaMs));
    // Cap at 0.99 so the bar visibly leaves room for the real completion.
    const capped = Math.min(0.99, eased);
    return phaseFrom + (phaseTo - phaseFrom) * capped;
  }

  function tick() {
    const target = easedTarget(performance.now());
    if (target > value) value = target;
    emit();
    raf = requestAnimationFrame(tick);
  }

  function emit() {
    const rounded = Math.round(value);
    if (rounded === lastEmitted) return;
    lastEmitted = rounded;
    onChange(rounded);
  }

  function startPhase(from: number, to: number, etaMs: number) {
    phaseFrom = Math.max(value, from); // monotonic: never go below current
    phaseTo = Math.max(phaseFrom, to);
    phaseEtaMs = Math.max(1, etaMs);
    phaseStartedAt = performance.now();
    if (value < phaseFrom) value = phaseFrom;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function reportPhaseProgress(pct01: number) {
    const clamped = Math.max(0, Math.min(1, pct01));
    const real = phaseFrom + (phaseTo - phaseFrom) * clamped;
    if (real > value) {
      value = real;
      emit();
    }
  }

  function endPhase() {
    if (phaseTo > value) value = phaseTo;
    emit();
  }

  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  return { startPhase, reportPhaseProgress, endPhase, stop };
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
