import type { DrumRow } from '../core/nodes';
import { createRng } from '../core/random';

/**
 * Synthesized drum voices, used only as a fallback when a row's samples fail to load.
 * Ported from fck-synth (drumKits.ts, kit BROKEN).
 */

interface Tone {
  readonly wave: OscillatorType;
  readonly start: number;
  readonly end: number;
  readonly sweep: number;
}
interface Noise {
  readonly type: BiquadFilterType;
  readonly frequency: number;
  readonly q: number;
  readonly mix: number;
}
interface Voice {
  readonly attack: number;
  readonly decay: number;
  readonly level: number;
  readonly tone?: Tone;
  readonly noise?: Noise;
}

const VOICES: Readonly<Record<DrumRow, Voice>> = {
  kick: { attack: 0.002, decay: 0.23, level: 0.72, tone: { wave: 'sine', start: 155, end: 47, sweep: 0.075 } },
  snare: {
    attack: 0.002,
    decay: 0.12,
    level: 0.31,
    tone: { wave: 'triangle', start: 240, end: 120, sweep: 0.045 },
    noise: { type: 'bandpass', frequency: 2100, q: 0.8, mix: 0.85 },
  },
  hat: { attack: 0.001, decay: 0.045, level: 0.16, noise: { type: 'highpass', frequency: 7200, q: 0.7, mix: 1 } },
  perc: {
    attack: 0.002,
    decay: 0.095,
    level: 0.2,
    tone: { wave: 'triangle', start: 900, end: 260, sweep: 0.045 },
    noise: { type: 'bandpass', frequency: 3500, q: 2, mix: 0.55 },
  },
};

/** One shared white-noise buffer per context, from a fixed seed. */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(context);
  if (!buffer) {
    buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.4), context.sampleRate);
    const random = createRng(0x6e6f6973);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    noiseBuffers.set(context, buffer);
  }
  return buffer;
}

/**
 * Plays the synthesized voice of a row into `destination` at `time`.
 * `rate` scales its pitch like a sample's playback rate. Returns the sources started.
 */
export function playSynthVoice(
  context: BaseAudioContext,
  row: DrumRow,
  destination: AudioNode,
  time: number,
  velocity: number,
  rate: number,
  /** The LFO on TONO, in cents, if any: it bends this hit while it sounds. */
  pitchMod: AudioNode | null = null,
): AudioScheduledSourceNode[] {
  const voice = VOICES[row];
  const sources: AudioScheduledSourceNode[] = [];
  /** Params the LFO feeds, to let go of when the hit ends. */
  const detuned: AudioParam[] = [];
  const end = time + voice.decay + 0.01;

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, voice.level * velocity), time + voice.attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + voice.decay);
  envelope.connect(destination);

  if (voice.tone) {
    const oscillator = context.createOscillator();
    oscillator.type = voice.tone.wave;
    oscillator.frequency.setValueAtTime(voice.tone.start * rate, time);
    oscillator.frequency.exponentialRampToValueAtTime(voice.tone.end * rate, time + voice.tone.sweep);
    oscillator.connect(envelope);
    pitchMod?.connect(oscillator.detune);
    detuned.push(oscillator.detune);
    sources.push(oscillator);
  }
  if (voice.noise) {
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer(context);
    const filter = context.createBiquadFilter();
    filter.type = voice.noise.type;
    filter.frequency.value = voice.noise.frequency * rate;
    filter.Q.value = voice.noise.q;
    const mix = context.createGain();
    mix.gain.value = voice.noise.mix;
    noise.connect(filter).connect(mix).connect(envelope);
    pitchMod?.connect(filter.detune);
    detuned.push(filter.detune);
    sources.push(noise);
  }
  for (const source of sources) {
    source.start(time);
    source.stop(end);
  }
  sources[0]?.addEventListener('ended', () => {
    envelope.disconnect();
    if (!pitchMod) return;
    for (const node of [...detuned]) {
      try {
        pitchMod.disconnect(node);
      } catch {
        // Already let go.
      }
    }
  });
  return sources;
}
