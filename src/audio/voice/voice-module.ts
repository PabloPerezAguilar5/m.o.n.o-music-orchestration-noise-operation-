import type { VoiceEvent } from '../../core/voice-events';
import type { AudioModule } from '../graph';
import { MOD_SOURCE, modSpan } from '../modulation';
import type { EngineParams } from './engine';
import {
  CUTOFF_MOD,
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
 * events and parameters go to the audio thread as messages; the LFO's cable lands on
 * the processor's CUTOFF parameter, sample by sample.
 */
export class VoiceModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  /** The LFO on CUTOFF: scaled to the instrument's span, into the processor. */
  private readonly mod: GainNode;
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
    this.mod = context.createGain();
    this.mod.gain.value = modSpan(instrument);
    const cutoff = this.node.parameters.get(CUTOFF_MOD);
    if (cutoff) this.mod.connect(cutoff);
  }

  inputFor(source: string): AudioNode {
    return source === MOD_SOURCE ? this.mod : this.input;
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
    this.mod.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }

  private post(message: VoiceMessage): void {
    this.node.port.postMessage(message);
  }
}
