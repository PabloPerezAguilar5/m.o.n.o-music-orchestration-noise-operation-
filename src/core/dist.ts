import { clamp01 } from './geometry';
import type { DistType } from './nodes';

/**
 * DISTORSIÓN knobs as numbers for the DSP. Pure TypeScript, shared by the worklet and the
 * tests. Every value here is a target: the DSP glides to it, so turning a knob never clicks.
 */

export interface DistSettings {
  readonly type: DistType;
  /** Knob values, 0..1. */
  readonly drive: number;
  readonly tone: number;
  readonly mix: number;
  readonly output: number;
  readonly chaos: number;
}

/** Gain into the shaper. SUAVE: up to +32 dB; DURA: up to +36 dB; CRUSH: a little push. */
export function distPreGain(type: DistType, drive: number): number {
  const d = clamp01(drive);
  if (type === 'crush') return 1 + d * 2;
  return 1 + d * d * (type === 'soft' ? 40 : 60);
}

/**
 * Pre-gain above which a typical instrument (peaks around 0.3) is fully saturated: past
 * it the shaper's output stops growing, so the level back down stops falling too.
 */
const SATURATED_GAIN = 6;

/**
 * Level back down after the shaper, so DRIVE changes the colour more than the loudness:
 * 1 / pre-gain while the signal still goes through cleanly, then flat once it is
 * saturated (a near-square wave is much louder than the wave it came from, at the same
 * peak). Measured on BASS: within about ±3 dB of the dry sound across DRIVE.
 */
export function distMakeup(type: DistType, drive: number): number {
  const d = clamp01(drive);
  if (type === 'crush') return 1 / (1 + d);
  return 1 / Math.min(distPreGain(type, d), SATURATED_GAIN);
}

/** CRUSH: bits kept, 16 at DRIVE 0 down to 3 at full. */
export const crushBits = (drive: number): number => 16 - clamp01(drive) * 13;

/** CRUSH: samples held (sample-rate reduction), 1 at DRIVE 0 up to 24 at full. */
export const crushHold = (drive: number): number => 1 + clamp01(drive) ** 1.5 * 23;

/** TONO: the low-pass after the shaper, 600 Hz (dark) … 19 kHz (open). */
export const distToneHz = (tone: number): number => 600 * 2 ** (clamp01(tone) * 5);

/** SALIDA: unity at half, +6 dB at full (like the channel levels on MASTER). */
export const distOutputGain = (output: number): number => clamp01(output) * 2;
