import type { VoiceEvent } from '../../core/voice-events';
import type { EngineParams } from './engine';

/** Name the voice processor registers in the AudioWorklet (one for every instrument). */
export const VOICE_PROCESSOR = 'mono-voice';

/** Instruments built on the shared voice engine. */
export type VoiceInstrument = 'bass' | 'synth' | 'lead';

/** Passed when the AudioWorkletNode is created: which engine to run. */
export interface VoiceProcessorOptions {
  readonly instrument: VoiceInstrument;
}

/** Main thread → voice processor. Times are AudioContext seconds. */
export type VoiceMessage =
  | { readonly type: 'params'; readonly params: EngineParams }
  | { readonly type: 'events'; readonly events: readonly VoiceEvent[] }
  /**
   * Drops every event from `time` on and releases all notes at `time`; `hard` within
   * milliseconds, whatever the release.
   */
  | { readonly type: 'flush'; readonly time: number; readonly hard?: boolean };
