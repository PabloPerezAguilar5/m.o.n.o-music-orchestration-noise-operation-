import type { BassEvent } from '../../core/bass-patterns';
import type { BassParams } from './bass-dsp';

/** Name the BASS processor registers in the AudioWorklet. */
export const BASS_PROCESSOR = 'mono-bass';

/** Main thread → BASS processor. Times are AudioContext seconds. */
export type BassMessage =
  | { readonly type: 'params'; readonly params: BassParams }
  | { readonly type: 'events'; readonly events: readonly BassEvent[] }
  /** Drops every event from `time` on and releases the note at `time`. */
  | { readonly type: 'flush'; readonly time: number };
