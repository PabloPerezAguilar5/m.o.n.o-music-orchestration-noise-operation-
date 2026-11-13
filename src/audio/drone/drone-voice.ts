import { DRONE_CHARACTERS, driftRates, type DroneLayerSound } from '../../core/drone-sound';
import type { DronePreset } from '../../core/drone';
import type { DroneFx } from './drone-fx';

/** Ratio of the bell partial and the sub to the note (fck-synth's GLASS and DRONE). */
const BELL_RATIO = 2.76;
const SUB_RATIO = 0.5;
/** The noise source is band-passed around this multiple of the note. */
const NOISE_RATIO = 3;
const NOISE_Q = 2;
/** Parameter glide, seconds: moving a finger or a knob never steps. */
const GLIDE = 0.035;
/** Silence threshold of the release (an exponential never reaches 0). */
const RELEASE_SPAN = 6;

/** Holds a param at its current value from `time`, dropping later automation. */
function holdAt(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(time);
  } else {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
  }
}

interface Source {
  readonly node: AudioScheduledSourceNode;
  /** Its frequency param and the multiple of the note it plays at. */
  readonly frequency: AudioParam;
  readonly ratio: number;
  /** Detune param, where movement and drift land. */
  readonly detune: AudioParam;
}

/**
 * One DRONE layer: up to five sources (main wave, detuned saw, bell partial, sub,
 * pitched noise) mixed by its preset, a filter, an envelope and the sends to the
 * node's effects. Its own slow LFO moves pitch and filter (the pad's upper half);
 * two drift oscillators make it wander under CAOS.
 */
export class DroneVoice {
  /** Whether the layer has started to fade out. */
  releasing = false;
  private readonly sources: Source[] = [];
  private readonly filter: BiquadFilterNode;
  private readonly envelope: GainNode;
  private readonly level: GainNode;
  private readonly partner: OscillatorNode | null;
  private readonly lfo: OscillatorNode;
  private readonly lfoPitch: GainNode;
  private readonly lfoCutoff: GainNode;
  private readonly driftPitch: GainNode;
  private readonly driftCutoff: GainNode;
  private readonly nodes: AudioNode[] = [];
  /** Every source, oscillators of movement and drift included: they all stop together. */
  private readonly allSources: AudioScheduledSourceNode[];
  /** When the fade-out ends (Infinity while the layer holds). */
  private releaseEnd = Infinity;

  constructor(
    context: BaseAudioContext,
    fx: DroneFx,
    noise: AudioBuffer,
    preset: DronePreset,
    layer: number,
    sound: DroneLayerSound,
    time: number,
    onEnded: () => void,
    /** The LFO on FILTRO, in cents, if the node has one: it moves this layer's filter too. */
    private readonly cutoffMod: AudioNode | null = null,
  ) {
    const character = DRONE_CHARACTERS[preset];
    const [main, detuned, bell, sub, noiseLevel] = character.mix;
    const keep = <T extends AudioNode>(node: T): T => {
      this.nodes.push(node);
      return node;
    };

    this.filter = keep(context.createBiquadFilter());
    this.filter.type = character.filter;
    this.filter.frequency.value = sound.cutoff;
    this.filter.Q.value = sound.q;
    this.envelope = keep(context.createGain());
    this.envelope.gain.value = 0;
    this.level = keep(context.createGain());
    this.level.gain.value = sound.gain;
    this.filter.connect(this.envelope).connect(this.level);

    // Dry and the two sends.
    this.level.connect(fx.dry);
    const delaySend = keep(context.createGain());
    const reverbSend = keep(context.createGain());
    delaySend.gain.value = character.delay;
    reverbSend.gain.value = character.reverb;
    this.level.connect(delaySend).connect(fx.delayIn);
    this.level.connect(reverbSend).connect(fx.reverbIn);

    const oscillator = (type: OscillatorType, ratio: number, mix: number): OscillatorNode | null => {
      if (mix <= 0) return null;
      const osc = keep(context.createOscillator());
      osc.type = type;
      osc.frequency.value = sound.frequency * ratio;
      const gain = keep(context.createGain());
      gain.gain.value = mix;
      osc.connect(gain).connect(this.filter);
      this.sources.push({ node: osc, frequency: osc.frequency, ratio, detune: osc.detune });
      return osc;
    };
    oscillator(character.wave, 1, main);
    this.partner = oscillator('sawtooth', 1, detuned);
    if (this.partner) this.partner.detune.value = sound.detune;
    oscillator('sine', BELL_RATIO, bell);
    oscillator('sine', SUB_RATIO, sub);
    if (noiseLevel > 0) {
      const source = keep(context.createBufferSource());
      source.buffer = noise;
      source.loop = true;
      const band = keep(context.createBiquadFilter());
      band.type = 'bandpass';
      band.Q.value = NOISE_Q;
      band.frequency.value = sound.frequency * NOISE_RATIO;
      const gain = keep(context.createGain());
      gain.gain.value = noiseLevel;
      source.connect(band).connect(gain).connect(this.filter);
      this.sources.push({ node: source, frequency: band.frequency, ratio: NOISE_RATIO, detune: band.detune });
    }

    // Movement: one LFO on pitch and cutoff. CAOS: two drift oscillators on both.
    this.lfo = keep(context.createOscillator());
    this.lfo.frequency.value = sound.lfoRate;
    this.lfoPitch = keep(context.createGain());
    this.lfoCutoff = keep(context.createGain());
    this.lfoPitch.gain.value = sound.lfoPitch;
    this.lfoCutoff.gain.value = sound.lfoCutoff;
    this.lfo.connect(this.lfoPitch);
    this.lfo.connect(this.lfoCutoff);
    this.driftPitch = keep(context.createGain());
    this.driftCutoff = keep(context.createGain());
    this.driftPitch.gain.value = sound.driftPitch / 2;
    this.driftCutoff.gain.value = sound.driftCutoff / 2;
    const drifts = driftRates(layer).map((rate) => {
      const drift = keep(context.createOscillator());
      drift.frequency.value = rate;
      drift.connect(this.driftPitch);
      drift.connect(this.driftCutoff);
      return drift;
    });
    for (const source of this.sources) {
      this.lfoPitch.connect(source.detune);
      this.driftPitch.connect(source.detune);
    }
    this.lfoCutoff.connect(this.filter.detune);
    this.driftCutoff.connect(this.filter.detune);
    this.cutoffMod?.connect(this.filter.detune);

    // Envelope: linear rise to full over the attack.
    const gain = this.envelope.gain;
    gain.setValueAtTime(0, time);
    gain.linearRampToValueAtTime(1, time + sound.attack);

    const all: AudioScheduledSourceNode[] = [...this.sources.map((s) => s.node), this.lfo, ...drifts];
    for (const source of all) source.start(time);
    this.sources[0]!.node.onended = () => {
      this.unmodulate();
      for (const node of this.nodes) node.disconnect();
      onEnded();
    };
    this.allSources = all;
  }

  /** New knob values or a new place on the pad: everything glides there. */
  apply(sound: DroneLayerSound, time: number): void {
    for (const source of this.sources) source.frequency.setTargetAtTime(sound.frequency * source.ratio, time, GLIDE);
    this.partner?.detune.setTargetAtTime(sound.detune, time, GLIDE);
    this.filter.frequency.setTargetAtTime(sound.cutoff, time, GLIDE);
    this.filter.Q.setTargetAtTime(sound.q, time, GLIDE);
    this.lfo.frequency.setTargetAtTime(sound.lfoRate, time, GLIDE * 3);
    this.lfoPitch.gain.setTargetAtTime(sound.lfoPitch, time, GLIDE);
    this.lfoCutoff.gain.setTargetAtTime(sound.lfoCutoff, time, GLIDE);
    this.driftPitch.gain.setTargetAtTime(sound.driftPitch / 2, time, GLIDE * 3);
    this.driftCutoff.gain.setTargetAtTime(sound.driftCutoff / 2, time, GLIDE * 3);
    this.level.gain.setTargetAtTime(sound.gain, time, GLIDE);
  }

  /** Fades out over `seconds` from `time`, then stops and frees everything. */
  release(time: number, seconds: number): void {
    if (this.releasing && seconds >= this.releaseLeft(time)) return;
    this.releasing = true;
    this.releaseEnd = time + seconds;
    const gain = this.envelope.gain;
    holdAt(gain, time);
    gain.setTargetAtTime(0, time, Math.max(0.002, seconds / RELEASE_SPAN));
    for (const source of this.allSources) source.stop(time + seconds + 0.02);
  }

  private releaseLeft(time: number): number {
    return this.releaseEnd - time;
  }

  /** Lets go of the node's LFO, which outlives the layer. */
  private unmodulate(): void {
    try {
      this.cutoffMod?.disconnect(this.filter.detune);
    } catch {
      // Already let go.
    }
  }

  /** Stops at once (the module is going away). */
  dispose(): void {
    this.unmodulate();
    for (const source of this.allSources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    for (const node of this.nodes) node.disconnect();
  }
}
