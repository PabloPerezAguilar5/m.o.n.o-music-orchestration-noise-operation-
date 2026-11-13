import type { BassScene } from '../../core/audio-scene';
import type { BassEvent } from '../../core/bass-patterns';
import { BASS_VOICES } from '../../core/bass-voices';
import type { AudioModule } from '../graph';
import { DECAY_OCTAVES, type BassParams } from './bass-dsp';
import { BASS_PROCESSOR, type BassMessage } from './bass-messages';
import processorUrl from './bass-processor.ts?worker&url';

/** Level of the voice into its cable, leaving headroom on the master. */
const OUTPUT_LEVEL = 0.9;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Voice parameters for a BASS scene: the panel knobs, shaped by the mode's character
 * (its envelope depth, decay scale and extra drive) and the wave and sub keys.
 */
export function bassParamsFromScene(scene: BassScene): BassParams {
  const voice = BASS_VOICES[scene.mode];
  return {
    cutoff: scene.cutoff,
    resonance: scene.resonance,
    // DECAY is exponential in time, so scaling the time is adding to the knob.
    decay: clamp01(scene.decay + Math.log2(voice.decay) / DECAY_OCTAVES),
    drive: clamp01(scene.drive + voice.drive),
    envMod: voice.envMod,
    wave: scene.wave === 'square' ? 1 : 0,
    sub: scene.sub ? 1 : 0,
  };
}

/**
 * Loads the BASS processor into a context. Call once per context; the promise
 * rejects where AudioWorklet is missing (e.g. a page not served from https).
 */
export function loadBassProcessor(context: BaseAudioContext): Promise<void> {
  if (!context.audioWorklet) return Promise.reject(new Error('AudioWorklet no disponible'));
  return context.audioWorklet.addModule(processorUrl);
}

/**
 * BASS in the audio graph: the worklet voice into `output`. It makes sound rather
 * than processing it, so `input` is unused. Note events and parameters go to the
 * audio thread as messages.
 */
export class BassModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.value = OUTPUT_LEVEL;
    this.node = new AudioWorkletNode(context, BASS_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.connect(this.output);
  }

  setParams(params: BassParams): void {
    this.post({ type: 'params', params });
  }

  schedule(events: readonly BassEvent[]): void {
    if (events.length > 0) this.post({ type: 'events', events });
  }

  /** Cancels what was scheduled from `time` on and releases the note then (stop, cable cut). */
  flush(time: number): void {
    this.post({ type: 'flush', time });
  }

  dispose(): void {
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }

  private post(message: BassMessage): void {
    this.node.port.postMessage(message);
  }
}
