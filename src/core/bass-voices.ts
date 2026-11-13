import type { BassMode } from './bass-patterns';

/**
 * Character of each BASS mode, adapted from fck-synth (bassVoices.ts) to the 303
 * voice: how long notes are held, how far the filter envelope opens, how long it
 * takes to close and extra drive. The panel knobs act on top of this.
 */
export interface BassVoiceCharacter {
  /** Multiplies the gate length. */
  readonly gate: number;
  /** Filter envelope depth, 0..1. */
  readonly envMod: number;
  /** Multiplies the DECAY knob's time. */
  readonly decay: number;
  /** Added to the DRIVE knob, 0..1. */
  readonly drive: number;
}

export const BASS_VOICES: Readonly<Record<BassMode, BassVoiceCharacter>> = {
  pulse: { gate: 1.4, envMod: 0.5, decay: 1, drive: 0 },
  broken: { gate: 0.9, envMod: 0.6, decay: 0.6, drive: 0.1 },
  dirty: { gate: 1.3, envMod: 0.8, decay: 0.9, drive: 0.35 },
  drone: { gate: 1.6, envMod: 0.35, decay: 1.6, drive: 0.1 },
  chaos: { gate: 1.2, envMod: 0.9, decay: 0.8, drive: 0.2 },
};
