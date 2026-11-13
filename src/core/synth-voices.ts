/**
 * SYNTH presets: the character of the sound, on top of which the six knobs act. A
 * preset does not move the knobs; it sets what they do not reach (filter envelope,
 * amplifier shape, drive, octave) and scales ATAQUE and RELEASE.
 */

export const SYNTH_PRESETS = ['pluck', 'pad', 'stab', 'glass'] as const;
export type SynthPreset = (typeof SYNTH_PRESETS)[number];

export interface SynthCharacter {
  /** Filter envelope depth 0..1 and decay time constant, seconds. */
  readonly envMod: number;
  readonly filterDecay: number;
  /** Amplifier decay time constant (s) and the level it settles at, 0..1. */
  readonly ampDecay: number;
  readonly sustain: number;
  readonly drive: number;
  /** Multipliers of the ATAQUE and RELEASE knob times. */
  readonly attackScale: number;
  readonly releaseScale: number;
  /** Added to CUTOFF (0..1). */
  readonly brightness: number;
  /** Semitones. */
  readonly transpose: number;
}

export const SYNTH_CHARACTERS: Readonly<Record<SynthPreset, SynthCharacter>> = {
  // Short and bright: the filter snaps shut, nothing sustains.
  pluck: { envMod: 0.65, filterDecay: 0.18, ampDecay: 0.3, sustain: 0, drive: 0.1, attackScale: 1, releaseScale: 1, brightness: 0, transpose: 0 },
  // Slow and wide: soft attack, long tail, the filter barely moves.
  pad: { envMod: 0.15, filterDecay: 1.5, ampDecay: 1.5, sustain: 0.85, drive: 0, attackScale: 12, releaseScale: 3, brightness: -0.05, transpose: 0 },
  // Short chord hits with bite.
  stab: { envMod: 0.5, filterDecay: 0.12, ampDecay: 0.18, sustain: 0.25, drive: 0.35, attackScale: 0.5, releaseScale: 0.6, brightness: 0.05, transpose: 0 },
  // An octave up, open and ringing.
  glass: { envMod: 0.4, filterDecay: 0.5, ampDecay: 0.9, sustain: 0.35, drive: 0, attackScale: 1, releaseScale: 1.5, brightness: 0.12, transpose: 12 },
};
