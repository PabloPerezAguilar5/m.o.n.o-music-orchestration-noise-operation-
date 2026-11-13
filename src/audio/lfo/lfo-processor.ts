/**
 * AudioWorklet processor of the LFO. Runs on the audio thread: the wave comes from
 * LfoDsp at audio rate, so what it moves glides sample by sample. A thinned copy of the
 * wave goes back to the main thread for the display and the knob rings.
 */
import { LfoDsp } from './lfo-dsp';
import { LFO_TRACE_RATE } from '../../core/lfo';
import { LFO_PROCESSOR, type LfoMessage, type LfoTrace } from './lfo-messages';

// AudioWorkletGlobalScope, which the DOM typings do not describe.
declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, processor: new (options: AudioWorkletNodeOptions) => unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/** Trace values sent at a time (16 ms of wave at LFO_TRACE_RATE). */
const TRACE_CHUNK = 8;

class LfoProcessor extends AudioWorkletProcessor {
  private readonly dsp = new LfoDsp(sampleRate);
  /** Bar times waiting to come (SYNC). */
  private bars: number[] = [];
  private readonly every = Math.max(1, Math.round(sampleRate / LFO_TRACE_RATE));
  private count = 0;
  private trace: number[] = [];

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<LfoMessage>) => {
      const message = event.data;
      if (message.type === 'params') this.dsp.setParams(message.settings);
      else this.bars.push(message.time);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const frames = out.length;
    const end = currentTime + frames / sampleRate;
    if (this.bars.length > 0) {
      const due = this.bars.filter((time) => time < end);
      this.bars = this.bars.filter((time) => time >= end);
      const last = due.at(-1);
      if (last !== undefined) this.dsp.bar(Math.max(0, Math.round((last - currentTime) * sampleRate)));
    }
    this.dsp.render(out, 0, frames);

    for (let i = 0; i < frames; i++) {
      if (++this.count < this.every) continue;
      this.count = 0;
      this.trace.push(out[i]!);
    }
    if (this.trace.length >= TRACE_CHUNK) {
      this.port.postMessage({ values: Float32Array.from(this.trace) } satisfies LfoTrace);
      this.trace = [];
    }
    return true;
  }
}

registerProcessor(LFO_PROCESSOR, LfoProcessor);
