import type { DistSettings } from '../../core/dist';
import type { AudioModule } from '../graph';
import { MOD_SOURCE, modSpan } from '../modulation';
import { loadWorklet } from '../worklets';
import { DIST_PROCESSOR, type DistMessage } from './dist-messages';
import processorUrl from './dist-processor.ts?worker&url';

/** Loads the DISTORSIÓN processor into a context, once. */
export const loadDistProcessor = (context: BaseAudioContext): Promise<void> => loadWorklet(context, processorUrl);

/**
 * DISTORSIÓN in the audio graph: `input` hears the sum of every cable into it, the
 * worklet shapes it, `output` sends it on. The LFO's cable lands on DRIVE.
 */
export class DistModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  /** The LFO on DRIVE, scaled to its span, into the processor (knob units). */
  private readonly mod: GainNode;
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, settings: DistSettings) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.node = new AudioWorkletNode(context, DIST_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.input.connect(this.node).connect(this.output);
    this.mod = context.createGain();
    this.mod.gain.value = modSpan('dist');
    const drive = this.node.parameters.get('driveMod');
    if (drive) this.mod.connect(drive);
    this.setSettings(settings);
  }

  inputFor(source: string): AudioNode {
    return source === MOD_SOURCE ? this.mod : this.input;
  }

  setSettings(settings: DistSettings): void {
    this.node.port.postMessage({ type: 'params', settings } satisfies DistMessage);
  }

  dispose(): void {
    this.node.disconnect();
    this.mod.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }
}
