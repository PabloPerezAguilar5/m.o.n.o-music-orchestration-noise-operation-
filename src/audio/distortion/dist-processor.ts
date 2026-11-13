/**
 * AudioWorklet processor of DISTORSIÓN. Runs on the audio thread: the sound comes from
 * DistDsp; knobs arrive as messages (smoothed inside), the LFO on DRIVE as an a-rate
 * AudioParam, so it moves sample by sample.
 */
import { DistDsp } from './dist-dsp';
import { DIST_PROCESSOR, type DistMessage } from './dist-messages';

// AudioWorkletGlobalScope, which the DOM typings do not describe.
declare const sampleRate: number;
declare function registerProcessor(name: string, processor: new (options: AudioWorkletNodeOptions) => unknown): void;
/** An AudioParam of the processor (AudioParamDescriptor, which the DOM typings lack). */
interface ParamDescriptor {
  readonly name: string;
  readonly defaultValue?: number;
  readonly automationRate?: 'a-rate' | 'k-rate';
}
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class DistProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): ParamDescriptor[] {
    return [{ name: 'driveMod', defaultValue: 0, automationRate: 'a-rate' }];
  }

  private readonly dsp = new DistDsp(sampleRate);

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<DistMessage>) => {
      if (event.data.type === 'params') this.dsp.setParams(event.data.settings);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const output = outputs[0];
    if (output && output.length > 0) this.dsp.process(inputs[0] ?? [], output, parameters.driveMod);
    return true;
  }
}

registerProcessor(DIST_PROCESSOR, DistProcessor);
