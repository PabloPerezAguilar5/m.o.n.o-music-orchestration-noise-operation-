import {
  crushBits,
  crushHold,
  distMakeup,
  distOutputGain,
  distPreGain,
  distToneHz,
  type DistSettings,
} from '../../core/dist';
import { createRng, type RandomSource } from '../../core/random';
import { clamp01, coefficient, softClip } from '../voice/dsp-math';

/**
 * DISTORSIÓN: the DSP, in plain TypeScript (no Web Audio), so it runs inside the
 * AudioWorklet and in unit tests alike. Like VoiceDsp, it is the boundary a
 * Rust/WebAssembly build would replace.
 *
 *   in ─┬─ 4x up ─ pre-gain ─ shaper ─ 4x down ─ DC block ─ tone ─┬─ mix ─ SALIDA ─ limiter ─ out
 *       └─────────────── delay (same latency as the wet path) ─────┘
 *
 * Oversampling: the shaper runs at four times the sample rate between two windowed-sinc
 * low-pass filters (polyphase), so the harmonics it makes above the original Nyquist are
 * filtered out instead of folding back as inharmonic aliasing. The dry path is delayed by
 * the filters' latency, so MEZCLA never combs.
 */

export const OVERSAMPLE = 4;
/** Taps of each half-band filter: odd, so its latency is a whole number of samples. */
export const FIR_TAPS = 97;
/** Latency of the wet path, in samples at the original rate. */
export const DIST_LATENCY = (FIR_TAPS - 1) / OVERSAMPLE;
/** Kaiser window shape: about 70 dB of stop-band rejection. */
const KAISER_BETA = 7;

/** Knob smoothing time constant, seconds. */
const SMOOTHING = 0.02;
/** A type change dips the wet path out and back in, each way, seconds. */
const TYPE_FADE = 0.012;
/** DC blocker corner, Hz. */
const DC_HZ = 10;
/** Final limiter: threshold and release. */
const LIMIT = 0.89;
const LIMITER_RELEASE = 0.08;
const CLIP_HEADROOM = 1.6;
/** CAOS: how far it pushes DRIVE around, knob units, and how often it picks a new direction. */
const CHAOS_DRIVE = 0.35;
const CHAOS_STEP_SECONDS = 0.07;
const CHAOS_SMOOTHING = 0.25;

/** Modified Bessel function of the first kind, order 0 (for the Kaiser window). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 40; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

/** Low-pass FIR at a cutoff (cycles per sample), Kaiser-windowed, unity gain at DC. */
export function lowpassFir(taps: number, cutoff: number, beta = KAISER_BETA): Float64Array {
  const h = new Float64Array(taps);
  const middle = (taps - 1) / 2;
  const norm = besselI0(beta);
  let sum = 0;
  for (let n = 0; n < taps; n++) {
    const x = n - middle;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const r = x / middle;
    const window = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / norm;
    h[n] = sinc * window;
    sum += h[n]!;
  }
  for (let n = 0; n < taps; n++) h[n]! /= sum;
  return h;
}

/** The filter both ways: cut at the original Nyquist (in cycles per oversampled sample). */
const FIR = lowpassFir(FIR_TAPS, 0.5 / OVERSAMPLE);
/** Polyphase split for the upsampler: phase p takes taps p, p+4, p+8 … (times 4 for the zeros). */
const PHASES: Float64Array[] = Array.from({ length: OVERSAMPLE }, (_, p) => {
  const taps: number[] = [];
  for (let k = p; k < FIR_TAPS; k += OVERSAMPLE) taps.push(FIR[k]! * OVERSAMPLE);
  return Float64Array.from(taps);
});

/** SUAVE's curve before its offset: softClip (a rational tanh), flat at ±1 beyond ±3. */
const SOFT_BIAS = 0.15;
/** DURA clips at this level. */
const HARD_CLIP = 0.8;
/** Below this input step, ADAA falls back to the curve at the midpoint (avoids 0/0). */
const ADAA_EPSILON = 1e-5;

/** Antiderivative of softClip: x²/18 + (4/3)·ln(9x² + 27) inside ±3, linear outside. */
const SOFT_EDGE = 9 / 18 + (4 / 3) * Math.log(9 * 9 + 27);
function softIntegral(x: number): number {
  const a = Math.abs(x);
  if (a > 3) return SOFT_EDGE + (a - 3);
  return (x * x) / 18 + (4 / 3) * Math.log(9 * x * x + 27);
}

/** Antiderivative of the hard clip at ±HARD_CLIP. */
function hardIntegral(x: number): number {
  const a = Math.abs(x);
  return a <= HARD_CLIP ? (x * x) / 2 : HARD_CLIP * a - (HARD_CLIP * HARD_CLIP) / 2;
}

const hardClip = (x: number): number => Math.max(-HARD_CLIP, Math.min(HARD_CLIP, x));

/**
 * First-order antiderivative anti-aliasing: the curve's average between this sample and
 * the last, (F(x) − F(x₋₁)) / (x − x₋₁), instead of its value at x. On top of the
 * oversampling, it tames what still folds back when the drive turns a wave almost square.
 */
function adaa(x: number, previous: number, curve: (x: number) => number, integral: (x: number) => number): number {
  const step = x - previous;
  return Math.abs(step) < ADAA_EPSILON
    ? curve((x + previous) / 2)
    : (integral(x) - integral(previous)) / step;
}

/** One channel's memory. */
class Channel {
  /** The shaper's last input (ADAA). */
  lastIn = 0;
  /** Input history for the upsampler, newest last (circular). */
  readonly upHistory = new Float64Array(Math.ceil(FIR_TAPS / OVERSAMPLE));
  upIndex = 0;
  /** Shaped, oversampled history for the downsampler (circular). */
  readonly downHistory = new Float64Array(FIR_TAPS);
  downIndex = 0;
  /** Dry delay line. */
  readonly dry = new Float64Array(DIST_LATENCY);
  dryIndex = 0;
  /** DC blocker. */
  dcIn = 0;
  dcOut = 0;
  /** Tone: state-variable low-pass. */
  ic1 = 0;
  ic2 = 0;
  /** CRUSH sample-and-hold. */
  held = 0;
  holdCount = 0;
}

export class DistDsp {
  private settings: DistSettings = { type: 'soft', drive: 0.3, tone: 0.6, mix: 1, output: 0.5, chaos: 0 };
  /** Type actually running; a new one waits for the dip. */
  private running = this.settings.type;
  /** Wet path level, 0..1: dips to switch type. */
  private typeLevel = 1;
  private drive = this.settings.drive;
  private tone = this.settings.tone;
  private mix = this.settings.mix;
  private output = this.settings.output;
  private chaos = 0;
  private wander = 0;
  private wanderTarget = 0;
  private wanderCount = 0;
  private limiterGain = 1;
  private readonly channels = [new Channel(), new Channel()];
  private readonly random: RandomSource;

  private readonly smooth: number;
  private readonly typeStep: number;
  private readonly dcPole: number;
  private readonly limiterRelease: number;
  private readonly chaosSmooth: number;
  private readonly chaosStep: number;

  constructor(
    private readonly rate: number,
    seed = 0x64697374,
  ) {
    this.smooth = coefficient(SMOOTHING, rate);
    this.typeStep = 1 / Math.max(1, TYPE_FADE * rate);
    this.dcPole = 1 - (2 * Math.PI * DC_HZ) / rate;
    this.limiterRelease = coefficient(LIMITER_RELEASE, rate);
    this.chaosSmooth = coefficient(CHAOS_SMOOTHING, rate);
    this.chaosStep = Math.max(1, Math.round(CHAOS_STEP_SECONDS * rate));
    this.random = createRng(seed);
  }

  setParams(settings: DistSettings): void {
    this.settings = settings;
  }

  /** DRIVE as it is right now (smoothed, CAOS included, LFO excluded). For tests. */
  get currentDrive(): number {
    return clamp01(this.drive + this.wander * this.chaos * CHAOS_DRIVE);
  }

  /**
   * Processes one block. `inputs` has one or two channels (none: silence in); `outputs`
   * gets as many as it has, a mono input copied to both. `driveMod` is the LFO on DRIVE, in
   * knob units: one value for the block or one per sample.
   */
  process(inputs: readonly Float32Array[], outputs: readonly Float32Array[], driveMod?: Float32Array): void {
    const out0 = outputs[0];
    if (!out0) return;
    const frames = out0.length;
    const channelCount = Math.min(2, Math.max(1, inputs.length));
    const s = this.settings;
    const k = this.smooth;

    for (let i = 0; i < frames; i++) {
      // Knobs glide; a type change dips the wet path to zero, switches, comes back.
      this.drive += (clamp01(s.drive) - this.drive) * k;
      this.tone += (clamp01(s.tone) - this.tone) * k;
      this.mix += (clamp01(s.mix) - this.mix) * k;
      this.output += (clamp01(s.output) - this.output) * k;
      this.chaos += (clamp01(s.chaos) - this.chaos) * k;
      if (this.running !== s.type) {
        this.typeLevel = Math.max(0, this.typeLevel - this.typeStep);
        if (this.typeLevel === 0) this.running = s.type;
      } else if (this.typeLevel < 1) {
        this.typeLevel = Math.min(1, this.typeLevel + this.typeStep);
      }
      this.stepWander();

      const mod = driveMod ? (driveMod.length === 1 ? driveMod[0]! : (driveMod[i] ?? 0)) : 0;
      const drive = clamp01(this.drive + this.wander * this.chaos * CHAOS_DRIVE + mod);
      const type = this.running;
      const pre = distPreGain(type, drive);
      const makeup = distMakeup(type, drive);
      const bits = crushBits(drive);
      const steps = 2 ** (bits - 1);
      const hold = crushHold(drive) * OVERSAMPLE * (1 + this.wander * this.chaos * 0.5);
      const g = Math.tan((Math.PI * Math.min(distToneHz(this.tone), this.rate * 0.45)) / this.rate);
      const mix = this.mix;
      const gain = distOutputGain(this.output);

      let peak = 0;
      const wetOut = [0, 0];
      for (let c = 0; c < channelCount; c++) {
        const input = inputs[c] ?? inputs[0];
        const x = input ? (input[i] ?? 0) : 0;
        const ch = this.channels[c]!;
        const wet = this.wet(ch, x, type, pre, makeup, steps, hold);
        const dry = this.delayDry(ch, x);
        const mixed = (dry * (1 - mix) + this.toneFilter(ch, wet, g) * mix * this.typeLevel) * gain;
        wetOut[c] = mixed;
        peak = Math.max(peak, Math.abs(mixed));
      }
      // One limiter for both channels, so the image never shifts.
      const wanted = peak > LIMIT ? LIMIT / peak : 1;
      this.limiterGain =
        wanted < this.limiterGain ? wanted : this.limiterGain + (1 - this.limiterGain) * this.limiterRelease;
      for (let c = 0; c < outputs.length; c++) {
        const value = wetOut[Math.min(c, channelCount - 1)]!;
        outputs[c]![i] = softClip(value * this.limiterGain * CLIP_HEADROOM) / CLIP_HEADROOM;
      }
    }
  }

  /** One input sample through 4x up, shaper, 4x down and the DC blocker. */
  private wet(
    ch: Channel,
    x: number,
    type: DistSettings['type'],
    pre: number,
    makeup: number,
    steps: number,
    hold: number,
  ): number {
    const up = ch.upHistory;
    const size = up.length;
    ch.upIndex = (ch.upIndex + 1) % size;
    up[ch.upIndex] = x;

    const down = ch.downHistory;
    let y = 0;
    for (let p = 0; p < OVERSAMPLE; p++) {
      // Upsampled sample p of this input sample.
      const taps = PHASES[p]!;
      let acc = 0;
      for (let t = 0; t < taps.length; t++) acc += taps[t]! * up[(ch.upIndex - t + size) % size]!;
      ch.downIndex = (ch.downIndex + 1) % FIR_TAPS;
      down[ch.downIndex] = this.shape(ch, acc * pre, type, steps, hold) * makeup;
      // Downsampled: one output per four shaped samples, taken on phase 0 so the whole
      // path is late by a whole number of samples (DIST_LATENCY).
      if (p === 0) {
        for (let t = 0; t < FIR_TAPS; t++) y += FIR[t]! * down[(ch.downIndex - t + FIR_TAPS) % FIR_TAPS]!;
      }
    }

    // DC blocker: the asymmetric shaper (SUAVE) leaves an offset.
    const blocked = y - ch.dcIn + this.dcPole * ch.dcOut;
    ch.dcIn = y;
    ch.dcOut = blocked;
    return blocked;
  }

  private shape(ch: Channel, x: number, type: DistSettings['type'], steps: number, hold: number): number {
    const previous = ch.lastIn;
    ch.lastIn = x;
    switch (type) {
      case 'soft':
        // tanh-like with a little asymmetry (even harmonics); its offset is blocked later.
        return adaa(x + SOFT_BIAS, previous + SOFT_BIAS, softClip, softIntegral) - softClip(SOFT_BIAS);
      case 'hard':
        return adaa(x, previous, hardClip, hardIntegral);
      case 'crush': {
        if (ch.holdCount <= 0) {
          ch.held = Math.round(Math.max(-1, Math.min(1, x)) * steps) / steps;
          ch.holdCount += hold;
        }
        ch.holdCount -= 1;
        return ch.held;
      }
    }
  }

  /** TONO: a two-pole low-pass (state variable, trapezoidal), smooth to sweep. */
  private toneFilter(ch: Channel, x: number, g: number): number {
    const k = Math.SQRT2; // Butterworth
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - ch.ic2;
    const v1 = a1 * ch.ic1 + a2 * v3;
    const v2 = ch.ic2 + a2 * ch.ic1 + a3 * v3;
    ch.ic1 = 2 * v1 - ch.ic1;
    ch.ic2 = 2 * v2 - ch.ic2;
    return v2;
  }

  /** The dry signal, late by the wet path's latency. */
  private delayDry(ch: Channel, x: number): number {
    const line = ch.dry;
    ch.dryIndex = (ch.dryIndex + 1) % line.length;
    const out = line[ch.dryIndex]!;
    line[ch.dryIndex] = x;
    return out;
  }

  /** CAOS: a slow random walk that leans on DRIVE (and on CRUSH's hold). */
  private stepWander(): void {
    if (--this.wanderCount <= 0) {
      this.wanderCount = this.chaosStep;
      this.wanderTarget = this.random() * 2 - 1;
    }
    this.wander += (this.wanderTarget - this.wander) * this.chaosSmooth;
  }
}
