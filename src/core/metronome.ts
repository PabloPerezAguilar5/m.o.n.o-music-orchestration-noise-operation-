/** Metronome: one click per beat (every 4 steps), accented on beat 1 of each bar. */

/** Steps per beat (16th notes in a 4/4 bar of 16 steps). */
export const STEPS_PER_BEAT = 4;

export type Click = 'accent' | 'beat';

/** The click on a step (0..15), or null when the step is not on a beat. */
export function clickAt(step: number): Click | null {
  if (!Number.isInteger(step) || step < 0 || step % STEPS_PER_BEAT !== 0) return null;
  return step === 0 ? 'accent' : 'beat';
}

/** Metronome VOL knob (0..1) to gain: squared for a natural taper. */
export const clickGain = (knob: number): number => {
  const value = Math.min(1, Math.max(0, Number.isFinite(knob) ? knob : 0));
  return value * value;
};
