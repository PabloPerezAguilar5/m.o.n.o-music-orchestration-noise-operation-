/**
 * AudioWorklet processor of the synth voices (BASS, SYNTH and LEAD). Runs on the audio thread.
 *
 * The main thread schedules note events ahead of time (the lookahead clock shared with
 * DRUM); this processor applies each one at its exact sample. The sound comes from a
 * VoiceDsp, so the DSP can be swapped for a Rust/WebAssembly build without touching the
 * scheduling.
 */
import type { VoiceEvent } from '../../core/voice-events';
import type { VoiceDsp } from './engine';
import { ENGINES } from './instruments';
import { CUTOFF_MOD, VOICE_PROCESSOR, type VoiceMessage, type VoiceProcessorOptions } from './voice-messages';

// AudioWorkletGlobalScope, which the DOM typings do not describe.
declare const sampleRate: number;
declare const currentTime: number;
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

/** A scheduled event, or a release of every note (flush). */
type Queued = VoiceEvent | { readonly type: 'panic'; readonly time: number; readonly hard: boolean };

class VoiceProcessor extends AudioWorkletProcessor {
  /** The LFO on CUTOFF, knob units, sample by sample. */
  static get parameterDescriptors(): ParamDescriptor[] {
    return [{ name: CUTOFF_MOD, defaultValue: 0, automationRate: 'a-rate' }];
  }

  private readonly dsp: VoiceDsp;
  /** Pending events, sorted by time. */
  private queue: Queued[] = [];

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const { instrument } = (options.processorOptions ?? {}) as Partial<VoiceProcessorOptions>;
    this.dsp = ENGINES[instrument ?? 'bass'](sampleRate);
    this.port.onmessage = (event: MessageEvent<VoiceMessage>) => this.receive(event.data);
  }

  private receive(message: VoiceMessage): void {
    switch (message.type) {
      case 'params':
        this.dsp.setParams(message.params);
        return;
      case 'events':
        this.queue.push(...message.events);
        break;
      case 'flush':
        this.queue = this.queue.filter((event) => event.time < message.time);
        this.queue.push({ type: 'panic', time: message.time, hard: message.hard ?? false });
        break;
    }
    this.queue.sort((a, b) => a.time - b.time);
  }

  private apply(event: Queued): void {
    if (event.type === 'on') this.dsp.noteOn(event.id, event.midi, event.accent, event.legato);
    else if (event.type === 'off') this.dsp.noteOff(event.id);
    else this.dsp.allOff(event.hard);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const mod = parameters[CUTOFF_MOD];
    const frames = out.length;
    let frame = 0;
    // Each event lands on its own sample: render up to it, apply it, carry on.
    while (this.queue.length > 0) {
      const at = Math.round((this.queue[0]!.time - currentTime) * sampleRate);
      if (at >= frames) break;
      const until = Math.max(frame, Math.min(frames, at));
      this.dsp.render(out, frame, until, mod);
      frame = until;
      this.apply(this.queue.shift()!);
    }
    this.dsp.render(out, frame, frames, mod);
    // Mono voice output: copy to any other channel.
    for (let channel = 1; channel < (outputs[0]?.length ?? 0); channel++) outputs[0]![channel]!.set(out);
    return true;
  }
}

registerProcessor(VOICE_PROCESSOR, VoiceProcessor);
