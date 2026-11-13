import { rowGain, toneRate, type DrumRowScene } from '../core/audio-scene';
import { DRUM_ROWS, type DrumRow } from '../core/nodes';
import { playSynthVoice } from './drum-voices';
import type { AudioModule } from './graph';

/** A kit's decoded samples, by row. A row with no buffers falls back to a synthesized voice. */
export interface LoadedKit {
  readonly id: string;
  readonly rows: Readonly<Record<DrumRow, readonly AudioBuffer[]>>;
  /** Files that could not be loaded ("manifest.json" if the manifest failed). */
  readonly failed: readonly string[];
}

/** Headroom so four rows hitting together do not drive the master into its limiter. */
const OUTPUT_LEVEL = 0.6;
/** Fades at both ends of a sample, against clicks (from fck-synth), seconds. */
const EDGE_FADE = 0.003;
const ROW_SMOOTHING = 0.015;

/** Stops a source now. Older engines throw if stop() was already called; that is fine here. */
const stopNow = (source: AudioScheduledSourceNode): void => {
  try {
    source.stop();
  } catch {
    // already stopped
  }
};

interface Playing {
  readonly sources: readonly AudioScheduledSourceNode[];
  readonly start: number;
}

/**
 * DRUM: four rows (kick, snare, hat, perc), each with its own volume and tone, summed
 * into `output`. DRUM makes sound rather than processing it, so `input` is unused.
 */
export class DrumModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly rows: Record<DrumRow, GainNode>;
  private readonly rates: Record<DrumRow, number> = { kick: 1, snare: 1, hat: 1, perc: 1 };
  private kit: LoadedKit | null = null;
  private readonly playing = new Set<Playing>();

  constructor(private readonly context: BaseAudioContext) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.value = OUTPUT_LEVEL;
    this.rows = Object.fromEntries(
      DRUM_ROWS.map((row) => {
        const gain = context.createGain();
        gain.connect(this.output);
        return [row, gain];
      }),
    ) as Record<DrumRow, GainNode>;
  }

  get kitId(): string | null {
    return this.kit?.id ?? null;
  }

  setKit(kit: LoadedKit | null): void {
    this.kit = kit;
  }

  /** How many samples a row can choose from (0 when it uses the fallback voice). */
  variants(row: DrumRow): number {
    return this.kit?.rows[row].length ?? 0;
  }

  /** Volume applies smoothly from `time`; tone applies to the hits scheduled after this call. */
  setRow(row: DrumRow, scene: DrumRowScene, time: number): void {
    this.rows[row].gain.setTargetAtTime(rowGain(scene.volume), time, ROW_SMOOTHING);
    this.rates[row] = toneRate(scene.tone);
  }

  /** Plays one hit of a row at `time`. */
  trigger(row: DrumRow, velocity: number, time: number, variant: number): void {
    this.play(this.kit, row, velocity, time, variant);
  }

  /**
   * One hit of a row from any kit, not necessarily the one playing, through that row's
   * volume and tone. Used to hear a kit before it switches in at the next bar.
   */
  preview(kit: LoadedKit, row: DrumRow, velocity: number, time: number): void {
    this.play(kit, row, velocity, time, 0);
  }

  private play(kit: LoadedKit | null, row: DrumRow, velocity: number, time: number, variant: number): void {
    const rate = this.rates[row];
    const buffers = kit?.rows[row] ?? [];
    const buffer = buffers[variant % Math.max(1, buffers.length)];
    const sources = buffer
      ? [this.playSample(buffer, this.rows[row], time, velocity, rate)]
      : playSynthVoice(this.context, row, this.rows[row], time, velocity, rate);

    const entry: Playing = { sources, start: time };
    this.playing.add(entry);
    sources[0]?.addEventListener('ended', () => this.playing.delete(entry));
  }

  /** Cancels hits that were scheduled ahead but have not started by `time` (on stop). */
  cancelAfter(time: number): void {
    for (const entry of this.playing) {
      if (entry.start <= time) continue;
      entry.sources.forEach(stopNow);
      this.playing.delete(entry);
    }
  }

  dispose(): void {
    for (const entry of this.playing) entry.sources.forEach(stopNow);
    this.playing.clear();
    for (const gain of Object.values(this.rows)) gain.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }

  private playSample(
    buffer: AudioBuffer,
    destination: AudioNode,
    time: number,
    velocity: number,
    rate: number,
  ): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const length = buffer.duration / rate;
    const fade = Math.min(EDGE_FADE, length / 3);

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(velocity, time + fade);
    envelope.gain.setValueAtTime(velocity, time + length - fade);
    envelope.gain.linearRampToValueAtTime(0, time + length);
    source.connect(envelope).connect(destination);
    source.addEventListener('ended', () => envelope.disconnect());
    source.start(time);
    return source;
  }
}
