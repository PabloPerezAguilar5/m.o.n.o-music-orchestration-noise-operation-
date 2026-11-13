import { createRng } from '../../core/random';

/** Delay: a dotted eighth of the tempo, its repeats darker each time. */
const DELAY_FEEDBACK = 0.38;
const DELAY_TONE_HZ = 2800;
const DELAY_MAX = 1.5;
const DELAY_RETURN = 0.6;
/** Reverb: a generated hall, ~2.8 s of decaying noise, different on each side. */
const REVERB_SECONDS = 2.8;
const REVERB_RETURN = 0.55;
const SMOOTHING = 0.05;
/** CLEAR: how fast the old tails fade before they are dropped. */
const CUT_FADE = 0.02;

/**
 * A decaying-noise impulse response, from a fixed seed so every run sounds the same.
 * Scaled by 1/√length (as fck-synth does) so the reverb comes out a little below its
 * input, whatever its length and the sample rate.
 */
export function hallImpulse(context: BaseAudioContext, seconds = REVERB_SECONDS): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  const scale = 2.2 / Math.sqrt(length);
  for (let channel = 0; channel < 2; channel++) {
    const random = createRng(0x5eed + channel);
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const fade = (1 - i / length) ** 3;
      data[i] = (random() * 2 - 1) * fade * scale;
    }
  }
  return impulse;
}

/**
 * The DRONE node's own effects: a dry path, a delay and a reverb. Layers feed three
 * inputs (dry, and a send into each effect); everything comes out of `output`. Native
 * Web Audio nodes; the effects could move into the DRONE worklet later, keeping these
 * three inputs.
 */
export class DroneFx {
  readonly dry: GainNode;
  readonly delayIn: GainNode;
  readonly reverbIn: GainNode;
  readonly output: GainNode;
  private readonly delay: DelayNode;
  private readonly nodes: AudioNode[];

  constructor(
    private readonly context: BaseAudioContext,
    impulse: AudioBuffer,
    destination: AudioNode,
  ) {
    this.dry = context.createGain();
    this.delayIn = context.createGain();
    this.reverbIn = context.createGain();
    this.output = context.createGain();

    this.delay = context.createDelay(DELAY_MAX);
    const feedback = context.createGain();
    const tone = context.createBiquadFilter();
    const delayReturn = context.createGain();
    feedback.gain.value = DELAY_FEEDBACK;
    tone.type = 'lowpass';
    tone.frequency.value = DELAY_TONE_HZ;
    delayReturn.gain.value = DELAY_RETURN;
    this.delayIn.connect(this.delay);
    this.delay.connect(tone).connect(feedback).connect(this.delay);
    tone.connect(delayReturn).connect(this.output);

    const reverb = context.createConvolver();
    const reverbReturn = context.createGain();
    reverb.normalize = false;
    reverb.buffer = impulse;
    reverbReturn.gain.value = REVERB_RETURN;
    this.reverbIn.connect(reverb).connect(reverbReturn).connect(this.output);

    this.dry.connect(this.output);
    this.output.connect(destination);
    this.nodes = [this.dry, this.delayIn, this.reverbIn, this.output, this.delay, feedback, tone, delayReturn, reverb, reverbReturn];
  }

  /** Delay time follows the tempo: a dotted eighth. */
  setTempo(bpm: number, time: number): void {
    const seconds = Math.min(DELAY_MAX, (0.75 * 60) / Math.max(1, bpm));
    this.delay.delayTime.setTargetAtTime(seconds, time, SMOOTHING);
  }

  /** Fades everything out from `time` (tails included) and frees the nodes once silent. */
  cut(time: number): void {
    const gain = this.output.gain;
    gain.cancelScheduledValues(time);
    gain.setValueAtTime(gain.value, time);
    gain.linearRampToValueAtTime(0, time + CUT_FADE);
    // The timer only frees nodes that are already silent; it plays nothing.
    const wait = Math.max(0, time + CUT_FADE - this.context.currentTime) + 0.1;
    setTimeout(() => this.dispose(), wait * 1000);
  }

  dispose(): void {
    for (const node of this.nodes) node.disconnect();
  }
}
