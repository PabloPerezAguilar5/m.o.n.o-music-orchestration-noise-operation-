/**
 * The BASS voice: a monophonic TB-303-style synth, sample by sample.
 *
 * Pure TypeScript with no Web Audio or DOM, so it runs inside the AudioWorklet and in
 * unit tests alike. `BassDsp` is the boundary meant to be reimplemented in
 * Rust/WebAssembly later: plain numbers in, a Float32Array out.
 *
 * Signal path: PolyBLEP saw/square (+ optional sub square one octave down) → 24 dB
 * ladder low-pass with saturation in each stage, opened by a decay envelope →
 * amplifier → drive → safety limiter.
 */

/** Panel controls, all 0..1 except `wave` (0 = saw, 1 = square, in between = mix). */
export interface BassParams {
  readonly cutoff: number;
  readonly resonance: number;
  readonly decay: number;
  readonly drive: number;
  readonly envMod: number;
  readonly wave: number;
  readonly sub: number;
}

export interface BassDsp {
  /** New targets; every one is smoothed inside, so jumps never click. */
  setParams(params: BassParams): void;
  /** Starts a note. `legato` glides from the sounding note without retriggering. */
  noteOn(midi: number, accent: boolean, legato: boolean): void;
  noteOff(): void;
  /** Writes samples [start, end) of `out`. */
  render(out: Float32Array, start: number, end: number): void;
}

export const DEFAULT_BASS_PARAMS: BassParams = {
  cutoff: 0.45,
  resonance: 0.55,
  decay: 0.45,
  drive: 0.3,
  envMod: 0.5,
  wave: 0,
  sub: 0,
};

// Tuning ----------------------------------------------------------------------------------------

/** CUTOFF knob range: 40 Hz … ~6.5 kHz, exponential. */
const CUTOFF_MIN_HZ = 40;
const CUTOFF_OCTAVES = 7.35;
/** How far the envelope opens the filter at full envMod, octaves. */
const ENV_OCTAVES = 4.5;
/** Accent: extra opening (octaves), resonance and level. */
const ACCENT_OCTAVES = 1.6;
const ACCENT_RESONANCE = 0.15;
const ACCENT_LEVEL = 1;
const NORMAL_LEVEL = 0.62;
/** Accent "sweep" decays faster than the main envelope, seconds. */
const ACCENT_DECAY = 0.12;
/** DECAY knob: 0.04 … ~2.5 s time constant. */
const DECAY_MIN = 0.04;
export const DECAY_OCTAVES = 6;
/** Slide: time constant of the pitch glide, seconds (the 303 takes about 60 ms). */
const SLIDE_TIME = 0.025;
/** Amplifier attack and release time constants, seconds. */
const AMP_ATTACK = 0.0015;
const AMP_RELEASE = 0.008;
/** Parameter smoothing time constant, seconds. */
const SMOOTHING = 0.012;
/** Resonance at full knob; 4 makes the ladder self-oscillate. */
const MAX_FEEDBACK = 3.9;
/** Limiter threshold and release. */
const LIMIT = 0.89;
const LIMITER_RELEASE = 0.08;
const OUTPUT_GAIN = 0.55;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** Fast tanh: accurate to ~1e-3 within ±3, saturates to ±1 beyond. */
export function softClip(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/**
 * PolyBLEP residual at phase `t` (0..1) for a phase step `dt`: subtracted at each
 * discontinuity, it removes most of the aliasing of a naive saw or square.
 */
export function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** One-pole coefficient for a time constant in seconds. */
const coefficient = (seconds: number, rate: number): number => 1 - Math.exp(-1 / Math.max(1e-6, seconds * rate));

export class Bass303 implements BassDsp {
  private readonly rate: number;
  private readonly smooth: number;

  // Targets and smoothed values.
  private target: BassParams = DEFAULT_BASS_PARAMS;
  private cutoff = DEFAULT_BASS_PARAMS.cutoff;
  private resonance = DEFAULT_BASS_PARAMS.resonance;
  private drive = DEFAULT_BASS_PARAMS.drive;
  private envMod = DEFAULT_BASS_PARAMS.envMod;
  private wave = DEFAULT_BASS_PARAMS.wave;
  private sub = DEFAULT_BASS_PARAMS.sub;

  // Oscillators.
  private phase = 0;
  private subPhase = 0;
  /** Pitch as log2(Hz), so glides are even in musical terms. */
  private pitch = Math.log2(55);
  private pitchTarget = Math.log2(55);
  private gliding = false;

  // Envelopes.
  private gate = false;
  private amp = 0;
  /** Accent level, eased like the amplifier so a retrigger never steps. */
  private level = NORMAL_LEVEL;
  private levelTarget = NORMAL_LEVEL;
  private filterEnv = 0;
  private accentEnv = 0;
  private accented = false;

  // Ladder filter stages (run at twice the sample rate).
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private s4 = 0;

  private limiterGain = 1;

  constructor(sampleRate: number) {
    this.rate = sampleRate;
    this.smooth = coefficient(SMOOTHING, sampleRate);
  }

  setParams(params: BassParams): void {
    this.target = params;
  }

  noteOn(midi: number, accent: boolean, legato: boolean): void {
    this.pitchTarget = Math.log2(440) + (midi - 69) / 12;
    if (legato && this.gate) {
      // Slide: glide to the new pitch; envelopes keep going.
      this.gliding = true;
      return;
    }
    this.gliding = false;
    this.pitch = this.pitchTarget;
    this.gate = true;
    this.accented = accent;
    this.levelTarget = accent ? ACCENT_LEVEL : NORMAL_LEVEL;
    this.filterEnv = 1;
    this.accentEnv = accent ? 1 : 0;
  }

  noteOff(): void {
    this.gate = false;
  }

  /** Current oscillator frequency in Hz (for tests and meters). */
  get frequency(): number {
    return 2 ** this.pitch;
  }

  /** Whether the amplifier is open (gate on or still releasing). */
  get sounding(): boolean {
    return this.gate || this.amp > 1e-4;
  }

  render(out: Float32Array, start: number, end: number): void {
    const rate = this.rate;
    const k = this.smooth;
    const target = this.target;
    const slide = coefficient(SLIDE_TIME, rate);
    const attack = coefficient(AMP_ATTACK, rate);
    const release = coefficient(AMP_RELEASE, rate);
    const decaySeconds = DECAY_MIN * 2 ** (clamp01(target.decay) * DECAY_OCTAVES);
    const decay = Math.exp(-1 / (decaySeconds * rate));
    const accentDecay = Math.exp(-1 / (ACCENT_DECAY * rate));
    const limiterRelease = coefficient(LIMITER_RELEASE, rate);
    const twice = rate * 2;

    for (let i = start; i < end; i++) {
      // Smoothed controls.
      this.cutoff += (clamp01(target.cutoff) - this.cutoff) * k;
      this.resonance += (clamp01(target.resonance) - this.resonance) * k;
      this.drive += (clamp01(target.drive) - this.drive) * k;
      this.envMod += (clamp01(target.envMod) - this.envMod) * k;
      this.wave += (clamp01(target.wave) - this.wave) * k;
      this.sub += (clamp01(target.sub) - this.sub) * k;

      // Pitch and oscillators.
      if (this.gliding) this.pitch += (this.pitchTarget - this.pitch) * slide;
      const hz = 2 ** this.pitch;
      const dt = Math.min(0.5, hz / rate);
      const saw = 2 * this.phase - 1 - polyBlep(this.phase, dt);
      const half = this.phase + 0.5 - Math.floor(this.phase + 0.5);
      const square = (this.phase < 0.5 ? 1 : -1) + polyBlep(this.phase, dt) - polyBlep(half, dt);
      const subDt = dt / 2;
      const subHalf = this.subPhase + 0.5 - Math.floor(this.subPhase + 0.5);
      const subSquare = (this.subPhase < 0.5 ? 1 : -1) + polyBlep(this.subPhase, subDt) - polyBlep(subHalf, subDt);
      this.phase += dt;
      if (this.phase >= 1) this.phase -= 1;
      this.subPhase += subDt;
      if (this.subPhase >= 1) this.subPhase -= 1;
      const oscillator = saw + (square - saw) * this.wave + subSquare * this.sub * 0.6;

      // Envelopes.
      this.filterEnv *= decay;
      this.accentEnv *= accentDecay;
      this.amp += ((this.gate ? 1 : 0) - this.amp) * (this.gate ? attack : release);
      this.level += (this.levelTarget - this.level) * attack;

      // Filter cutoff and resonance for this sample.
      const octaves =
        CUTOFF_OCTAVES * this.cutoff + ENV_OCTAVES * this.envMod * this.filterEnv + ACCENT_OCTAVES * this.accentEnv;
      const fc = Math.min(twice * 0.24, CUTOFF_MIN_HZ * 2 ** octaves);
      const g = 1 - Math.exp((-2 * Math.PI * fc) / twice);
      const feedback =
        MAX_FEEDBACK * Math.min(1, this.resonance + (this.accented ? ACCENT_RESONANCE * this.accentEnv : 0));

      // 24 dB ladder, two passes per sample (2x oversampling, input held).
      const input = oscillator * 0.5;
      for (let pass = 0; pass < 2; pass++) {
        const u = softClip(input - feedback * this.s4);
        this.s1 += g * (u - softClip(this.s1));
        this.s2 += g * (softClip(this.s1) - softClip(this.s2));
        this.s3 += g * (softClip(this.s2) - softClip(this.s3));
        this.s4 += g * (softClip(this.s3) - softClip(this.s4));
      }
      // Resonance thins the low end of a ladder; give some of it back.
      const filtered = this.s4 * (1 + feedback * 0.35);

      // Amplifier, drive and limiter.
      const voiced = filtered * this.amp * this.level;
      const push = 1 + this.drive * 8;
      const driven = softClip(voiced * push) / (1 + this.drive * 1.5);
      const peak = Math.abs(driven);
      const wanted = peak > LIMIT ? LIMIT / peak : 1;
      this.limiterGain = wanted < this.limiterGain ? wanted : this.limiterGain + (1 - this.limiterGain) * limiterRelease;
      out[i] = softClip(driven * this.limiterGain * OUTPUT_GAIN * 1.6) / 1.6;
    }
  }
}
