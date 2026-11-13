/** Small DSP helpers shared by the synth voices. Pure functions, no Web Audio. */

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** Fast tanh: accurate to ~1e-3 within ±3, saturates to ±1 beyond. */
export function softClip(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/**
 * PolyBLEP residual at phase `t` (0..1) for a phase step `dt`: subtracted at each
 * discontinuity, it removes most of the aliasing of a naive saw or square.
 */
export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** One-pole smoothing coefficient for a time constant in seconds. */
export const coefficient = (seconds: number, rate: number): number =>
  1 - Math.exp(-1 / Math.max(1e-6, seconds * rate));

/** Per-sample multiplier that decays by 1/e in `seconds`. */
export const decayFactor = (seconds: number, rate: number): number => Math.exp(-1 / Math.max(1e-6, seconds * rate));
