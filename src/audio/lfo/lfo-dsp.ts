import { lfoWave, type LfoShape } from '../../core/lfo';
import { createRng, type RandomSource } from '../../core/random';
import { clamp01, coefficient } from '../voice/dsp-math';

/**
 * LFO: the wave, in plain TypeScript (no Web Audio), so it runs inside the AudioWorklet
 * and in unit tests alike.
 *
 * The output (-1..1) always glides: a one-pole slew rounds the edges of SQUARE and the
 * steps of RANDOM (sample and hold), and every change of shape, so whatever it moves never
 * jumps. CANTIDAD is applied after this, by a gain on the audio thread.
 */

export interface LfoSettings {
  readonly shape: LfoShape;
  /** Cycles per second (lfoRate: free, or a division of the tempo). */
  readonly rate: number;
  /** SYNC: the phase is put back to 0 on every bar (bar()). */
  readonly sync: boolean;
  /** CAOS, 0..1. */
  readonly chaos: number;
}

/** The slew on the output, seconds: fast enough for a crisp 20 Hz, slow enough to never click. */
export const LFO_SLEW = 0.004;
/** Rate changes glide too (a knob turn never jerks the phase speed), seconds. */
const RATE_SMOOTHING = 0.05;
/** CAOS: how far one cycle's speed (free only) and height may stray. */
const CHAOS_RATE = 0.5;
const CHAOS_HEIGHT = 0.6;

export class LfoDsp {
  private settings: LfoSettings = { shape: 'sine', rate: 1, sync: false, chaos: 0 };
  private phase = 0;
  private rate = 1;
  private value = 0;
  private held = 0;
  /** This cycle's CAOS: speed factor and height. */
  private cycleRate = 1;
  private cycleHeight = 1;
  /** Sample, within the next render, where a bar starts (SYNC), or -1. */
  private barAt = -1;
  private readonly slew: number;
  private readonly rateSmooth: number;
  private readonly random: RandomSource;

  constructor(
    private readonly sampleRate: number,
    seed = 0x6c666f,
  ) {
    this.slew = coefficient(LFO_SLEW, sampleRate);
    this.rateSmooth = coefficient(RATE_SMOOTHING, sampleRate);
    this.random = createRng(seed);
    this.held = this.random() * 2 - 1;
  }

  setParams(settings: LfoSettings): void {
    if (settings.rate > 0 && this.settings.rate <= 0) this.rate = settings.rate;
    this.settings = settings;
  }

  /** A bar starts at sample `offset` of the next render (SYNC puts the phase back to 0 there). */
  bar(offset: number): void {
    this.barAt = Math.max(0, Math.floor(offset));
  }

  /** Where in its cycle the wave is, 0..1. For tests and the display. */
  get currentPhase(): number {
    return this.phase;
  }

  /** Writes samples [start, end) of `out`. */
  render(out: Float32Array, start = 0, end = out.length): void {
    const s = this.settings;
    const chaos = clamp01(s.chaos);
    for (let i = start; i < end; i++) {
      if (i === this.barAt) {
        this.barAt = -1;
        if (s.sync) this.newCycle(true);
      }
      this.rate += (Math.max(0, s.rate) - this.rate) * this.rateSmooth;
      this.phase += (this.rate * (s.sync ? 1 : this.cycleRate)) / this.sampleRate;
      if (this.phase >= 1) this.newCycle(false);
      const target = lfoWave(s.shape, this.phase, this.held) * (1 - chaos * (1 - this.cycleHeight));
      this.value += (target - this.value) * this.slew;
      out[i] = this.value;
    }
    if (this.barAt >= end) this.barAt -= end;
  }

  /** A cycle begins: RANDOM picks its next value, CAOS its speed and height. */
  private newCycle(reset: boolean): void {
    this.phase = reset ? 0 : this.phase - Math.floor(this.phase);
    this.held = this.random() * 2 - 1;
    const r1 = this.random();
    const r2 = this.random();
    this.cycleRate = 1 + (r1 * 2 - 1) * CHAOS_RATE * clamp01(this.settings.chaos);
    this.cycleHeight = 1 - r2 * CHAOS_HEIGHT;
  }
}
