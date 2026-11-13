import type { LfoSettings } from './lfo-dsp';

/** Name the LFO processor registers in the AudioWorklet. */
export const LFO_PROCESSOR = 'mono-lfo';

export { LFO_TRACE_RATE } from '../../core/lfo';

/** Main thread → LFO processor. Times are AudioContext seconds. */
export type LfoMessage =
  | { readonly type: 'params'; readonly settings: LfoSettings }
  /** A bar starts at `time` (SYNC puts the phase back to 0 there). */
  | { readonly type: 'bar'; readonly time: number };

/** LFO processor → main thread: the latest stretch of the wave, LFO_TRACE_RATE values a second. */
export interface LfoTrace {
  readonly values: Float32Array;
}
