import type { VoiceEvent } from '../../core/voice-events';
import type { AudioModule } from '../graph';
import type { EngineParams } from './engine';
import {
  VOICE_PROCESSOR,
  type VoiceInstrument,
  type VoiceMessage,
  type VoiceProcessorOptions,
} from './voice-messages';
import processorUrl from './voice-processor.ts?worker&url';

const loads = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * Loads the voice processor into a context, once (BASS, SYNTH and LEAD share it). Rejects
 * where AudioWorklet is missing (e.g. a page not served from https or localhost).
 */
export function loadVoiceProcessor(context: BaseAudioContext): Promise<void> {
  let load = loads.get(context);
  if (!load) {
    load = context.audioWorklet
      ? context.audioWorklet.addModule(processorUrl)
      : Promise.reject(new Error('AudioWorklet no disponible'));
    loads.set(context, load);
  }
  return load;
}

/**
 * An instrument on the shared voice engine, in the audio graph: the worklet into
 * `output`. It makes sound rather than processing it, so `input` is unused. Note
 * events and parameters go to the audio thread as messages.
 */
export class VoiceModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, instrument: VoiceInstrument, level: number) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.value = level;
    this.node = new AudioWorkletNode(context, VOICE_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { instrument } satisfies VoiceProcessorOptions,
    });
    this.node.connect(this.output);
  }

  setParams(params: EngineParams): void {
    this.post({ type: 'params', params });
  }

  schedule(events: readonly VoiceEvent[]): void {
    if (events.length > 0) this.post({ type: 'events', events });
  }

  /**
   * Cancels what was scheduled from `time` on and releases every note then (stop, cable
   * cut); `hard` fades them in milliseconds instead of their release.
   */
  flush(time: number, hard = false): void {
    this.post({ type: 'flush', time, hard });
  }

  dispose(): void {
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }

  private post(message: VoiceMessage): void {
    this.node.port.postMessage(message);
  }
}
