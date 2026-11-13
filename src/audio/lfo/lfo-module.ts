import type { AudioModule } from '../graph';
import { loadWorklet } from '../worklets';
import type { LfoSettings } from './lfo-dsp';
import { LFO_PROCESSOR, type LfoMessage, type LfoTrace } from './lfo-messages';
import processorUrl from './lfo-processor.ts?worker&url';

/** CANTIDAD changes glide (time constant), seconds. */
const DEPTH_SMOOTHING = 0.02;

/** Loads the LFO processor into a context, once. */
export const loadLfoProcessor = (context: BaseAudioContext): Promise<void> => loadWorklet(context, processorUrl);

/**
 * LFO in the audio graph: the wave (worklet, -1..1) times CANTIDAD is `output`. Its
 * cables carry it to the modules it moves, each into `inputFor('lfo')`. It takes no input.
 */
export class LfoModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly node: AudioWorkletNode;

  constructor(
    context: BaseAudioContext,
    settings: LfoSettings,
    depth: number,
    onTrace: (values: Float32Array) => void,
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.value = depth;
    this.node = new AudioWorkletNode(context, LFO_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.connect(this.output);
    this.node.port.onmessage = (event: MessageEvent<LfoTrace>) => onTrace(event.data.values);
    this.setSettings(settings);
  }

  setSettings(settings: LfoSettings): void {
    this.post({ type: 'params', settings });
  }

  /** CANTIDAD, 0..1, gliding from `time`. */
  setDepth(depth: number, time: number): void {
    this.output.gain.setTargetAtTime(depth, time, DEPTH_SMOOTHING);
  }

  /** A bar starts at `time`: with SYNC the wave starts its cycle there. */
  bar(time: number): void {
    this.post({ type: 'bar', time });
  }

  dispose(): void {
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }

  private post(message: LfoMessage): void {
    this.node.port.postMessage(message);
  }
}
