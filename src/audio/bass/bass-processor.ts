/**
 * AudioWorklet processor of the BASS voice. Runs on the audio thread.
 *
 * The main thread schedules note events ahead of time (the same lookahead clock as
 * DRUM); this processor applies each one at its exact sample. The sound itself comes
 * from a BassDsp, so the DSP can be swapped for a Rust/WebAssembly build without
 * touching the scheduling.
 */
import type { BassEvent } from '../../core/bass-patterns';
import { Bass303 } from './bass-dsp';
import { BASS_PROCESSOR, type BassMessage } from './bass-messages';

// AudioWorkletGlobalScope, which the DOM typings do not describe.
declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, processor: new () => unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/** Render quantum, frames. */
const QUANTUM = 128;

class BassProcessor extends AudioWorkletProcessor {
  private readonly dsp = new Bass303(sampleRate);
  /** Pending events, sorted by time. */
  private queue: BassEvent[] = [];
  /** Id of the note sounding (or held) now; note-offs for other ids are stale. */
  private current = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<BassMessage>) => this.receive(event.data);
  }

  private receive(message: BassMessage): void {
    switch (message.type) {
      case 'params':
        this.dsp.setParams(message.params);
        break;
      case 'events':
        this.queue.push(...message.events);
        this.queue.sort((a, b) => a.time - b.time);
        break;
      case 'flush':
        this.queue = this.queue.filter((event) => event.time < message.time);
        this.queue.push({ type: 'off', time: message.time, id: this.current });
        this.queue.sort((a, b) => a.time - b.time);
        break;
    }
  }

  private apply(event: BassEvent): void {
    if (event.type === 'on') {
      this.current = event.id;
      this.dsp.noteOn(event.midi, event.accent, event.legato);
    } else if (event.id === this.current) {
      this.dsp.noteOff();
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const frames = out.length || QUANTUM;
    let frame = 0;
    // Each event lands on its own sample: render up to it, apply it, carry on.
    while (this.queue.length > 0) {
      const at = Math.round((this.queue[0]!.time - currentTime) * sampleRate);
      if (at >= frames) break;
      const until = Math.max(frame, Math.min(frames, at));
      this.dsp.render(out, frame, until);
      frame = until;
      this.apply(this.queue.shift()!);
    }
    this.dsp.render(out, frame, frames);
    // Mono voice: copy to any other output channel.
    for (let channel = 1; channel < (outputs[0]?.length ?? 0); channel++) outputs[0]![channel]!.set(out);
    return true;
  }
}

registerProcessor(BASS_PROCESSOR, BassProcessor);
