import { FILTER_OCTAVES, sliceDrive, sliceFilterHz, sliceFilterQ, sliceGain } from '../../core/slice';
import type { AudioModule } from '../graph';
import { MOD_SOURCE, modSpan } from '../modulation';

/** Level of the pieces into the BASS output: samples peak at −1 dBFS, this leaves headroom. */
const OUTPUT_LEVEL = 0.7;
/** Fade at both ends of a piece, seconds: no clicks, barely audible (2 … 5 ms asked). */
export const EDGE_FADE = 0.003;
/** Smoothing of knob changes (time constant), seconds. */
const KNOB_SMOOTHING = 0.015;
/** Sources are stopped a little after their envelope reaches zero. */
const STOP_MARGIN = 0.01;

/** One piece to play: a window of the buffer at a speed, at an audio time. */
export interface SliceHit {
  readonly time: number;
  /** Window in seconds of the (forward) buffer. */
  readonly start: number;
  readonly end: number;
  readonly rate: number;
  readonly reverse: boolean;
  /** How much of the window sounds, 0..1. */
  readonly gate: number;
}

/** SLICE knobs as the module takes them (0..1). */
export interface SliceKnobs {
  readonly volume: number;
  readonly filter: number;
  readonly drive: number;
}

interface Playing {
  readonly source: AudioBufferSourceNode;
  readonly envelope: GainNode;
  readonly start: number;
  /** When the attack has settled: the envelope can be cut from here. */
  readonly settled: number;
  /** When the release starts. */
  releaseAt: number;
  end: number;
}

/** tanh curve, 2049 points over −1..1. */
function tanhCurve(size = 2049): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) curve[i] = Math.tanh((i / (size - 1)) * 2 - 1);
  return curve;
}

/** The same audio, backwards, so a piece can play in reverse by reading forwards. */
export function reverseBuffer(context: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const reversed = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    const out = reversed.getChannelData(channel);
    const last = data.length - 1;
    for (let i = 0; i <= last; i++) out[i] = data[last - i]!;
  }
  return reversed;
}

const stopNow = (source: AudioScheduledSourceNode): void => {
  try {
    source.stop();
  } catch {
    // already stopped
  }
};

/**
 * BASS in SLICE mode, in the audio graph: pieces of the loop (AudioBufferSourceNodes),
 * each with micro-fades, through a resonant low-pass, a drive stage and the volume,
 * into `output`. A piece that starts while another sounds releases it (a fade of
 * EDGE_FADE). The LFO's cable lands on the filter's frequency. It makes sound rather
 * than processing it, so `input` is unused.
 */
export class SliceModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly bus: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly pre: GainNode;
  private readonly shaper: WaveShaperNode;
  private readonly post: GainNode;
  private readonly volume: GainNode;
  /** The LFO on FILTRO: knob units in, cents out, into the filter's detune. */
  private readonly mod: GainNode;
  private buffer: AudioBuffer | null = null;
  private reversed: AudioBuffer | null = null;
  private readonly playing = new Set<Playing>();

  constructor(
    private readonly context: BaseAudioContext,
    knobs: SliceKnobs,
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.output.gain.value = OUTPUT_LEVEL;
    this.bus = context.createGain();
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.pre = context.createGain();
    this.shaper = context.createWaveShaper();
    this.shaper.curve = tanhCurve();
    this.shaper.oversample = '2x';
    this.post = context.createGain();
    this.volume = context.createGain();
    this.bus.connect(this.filter).connect(this.pre).connect(this.shaper).connect(this.post).connect(this.volume);
    this.volume.connect(this.output);
    this.mod = context.createGain();
    this.mod.gain.value = FILTER_OCTAVES * 1200 * modSpan('bass');
    this.mod.connect(this.filter.detune);
    this.setKnobs(knobs, 0, true);
  }

  inputFor(source: string): AudioNode {
    return source === MOD_SOURCE ? this.mod : this.input;
  }

  /** The loop whose pieces play. Pieces already scheduled keep the buffer they started with. */
  setBuffer(buffer: AudioBuffer | null): void {
    if (buffer === this.buffer) return;
    this.buffer = buffer;
    this.reversed = null;
  }

  get hasBuffer(): boolean {
    return this.buffer !== null;
  }

  /** Knobs glide to their new value from `time` (`jump`: set at once, on creation). */
  setKnobs(knobs: SliceKnobs, time: number, jump = false): void {
    const { pre, post } = sliceDrive(knobs.drive);
    const targets: [AudioParam, number][] = [
      [this.filter.frequency, sliceFilterHz(knobs.filter)],
      [this.filter.Q, sliceFilterQ(knobs.filter)],
      [this.pre.gain, pre],
      [this.post.gain, post],
      [this.volume.gain, sliceGain(knobs.volume)],
    ];
    for (const [param, value] of targets) {
      if (jump) param.value = value;
      else param.setTargetAtTime(value, time, KNOB_SMOOTHING);
    }
  }

  /** Plays one piece of the loop (or of `buffer`, to hear another loop). */
  play(hit: SliceHit, buffer: AudioBuffer | null = this.buffer): void {
    if (!buffer || hit.end <= hit.start || hit.rate <= 0) return;
    const reversed = hit.reverse ? this.reversedOf(buffer) : null;
    const source = this.context.createBufferSource();
    source.buffer = reversed ?? buffer;
    source.playbackRate.value = hit.rate;
    const window = (hit.end - hit.start) * Math.min(1, Math.max(0, hit.gate));
    // Reading the reversed buffer forwards from where the window ends plays the window backwards.
    const offset = reversed ? Math.max(0, buffer.duration - hit.end) : hit.start;
    const length = window / hit.rate;
    const fade = Math.min(EDGE_FADE, length / 3);
    const { time } = hit;

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(1, time + fade);
    envelope.gain.setValueAtTime(1, time + length - fade);
    envelope.gain.linearRampToValueAtTime(0, time + length);
    source.connect(envelope).connect(this.bus);

    this.releaseAt(time);
    const entry: Playing = { source, envelope, start: time, settled: time + fade, releaseAt: time + length - fade, end: time + length };
    this.playing.add(entry);
    source.addEventListener('ended', () => {
      envelope.disconnect();
      source.disconnect();
      this.playing.delete(entry);
    });
    source.start(time, offset);
    source.stop(time + length + STOP_MARGIN);
  }

  /** Fades every piece sounding at `time` out, and drops the ones that have not started. */
  flush(time: number): void {
    for (const entry of [...this.playing]) {
      if (entry.start > time) {
        stopNow(entry.source);
        this.playing.delete(entry);
      }
    }
    this.releaseAt(time);
  }

  /** Cancels pieces that were scheduled ahead but have not started by `time` (on stop). */
  cancelAfter(time: number): void {
    for (const entry of [...this.playing]) {
      if (entry.start <= time) continue;
      stopNow(entry.source);
      this.playing.delete(entry);
    }
  }

  /** How many pieces are scheduled or sounding. For tests. */
  get voices(): number {
    return this.playing.size;
  }

  dispose(): void {
    for (const entry of this.playing) stopNow(entry.source);
    this.playing.clear();
    this.bus.disconnect();
    this.filter.disconnect();
    this.pre.disconnect();
    this.shaper.disconnect();
    this.post.disconnect();
    this.volume.disconnect();
    this.mod.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }

  /**
   * Releases, at `time`, the pieces that would still sound then: their envelope goes to
   * zero over EDGE_FADE from `time`. Pieces still in their attack or already releasing
   * are left to finish on their own (cutting a ramp in flight would click).
   */
  private releaseAt(time: number): void {
    for (const entry of this.playing) {
      if (time < entry.settled || time >= entry.releaseAt) continue;
      const gain = entry.envelope.gain;
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(1, time);
      gain.linearRampToValueAtTime(0, time + EDGE_FADE);
      entry.releaseAt = time;
      entry.end = time + EDGE_FADE;
      entry.source.stop(entry.end + STOP_MARGIN);
    }
  }

  private reversedOf(buffer: AudioBuffer): AudioBuffer {
    if (buffer !== this.buffer) return reverseBuffer(this.context, buffer);
    this.reversed ??= reverseBuffer(this.context, buffer);
    return this.reversed;
  }
}
