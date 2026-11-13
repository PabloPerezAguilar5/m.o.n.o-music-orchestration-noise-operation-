import { clamp01, coefficient, decayFactor, softClip } from './dsp-math';
import { Voice, type VoiceControls, type VoiceDesign, type VoiceTiming } from './voice';

/**
 * A synth engine: one or more voices of the same design, summed, then drive and a
 * safety limiter. BASS is this engine with one voice (mono, slides glide); SYNTH is it
 * with four (chords; the oldest voice is stolen when a fifth note comes).
 *
 * Pure TypeScript with no Web Audio or DOM, so it runs inside the AudioWorklet and in
 * unit tests alike. `VoiceDsp` is the boundary meant to be reimplemented in
 * Rust/WebAssembly later: plain numbers in, a Float32Array out.
 */

/** Live parameters. Unitless ones are 0..1 and smoothed; times are seconds. */
export interface EngineParams {
  readonly cutoff: number;
  readonly resonance: number;
  readonly envMod: number;
  /** 0 = saw, 1 = square, in between = a morph. */
  readonly wave: number;
  readonly sub: number;
  readonly detune: number;
  readonly drive: number;
  /** Filter envelope decay time constant. */
  readonly filterDecay: number;
  /** Amplifier: linear attack time, decay time constant to sustain (0..1), release time constant. */
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  /** Semitones added to every note (a preset's octave). */
  readonly transpose: number;
}

export interface VoiceDsp {
  /** New targets; unitless ones are smoothed inside, so jumps never click. */
  setParams(params: EngineParams): void;
  /** Starts note `id`. `legato` glides from the sounding note without retriggering (mono only). */
  noteOn(id: number, midi: number, accent: boolean, legato: boolean): void;
  /** Releases note `id`; ids that are not sounding are ignored. */
  noteOff(id: number): void;
  /** Releases everything (stop, cable cut). */
  allOff(): void;
  /** Writes samples [start, end) of `out`. */
  render(out: Float32Array, start: number, end: number): void;
}

/** Output stage, per instrument. */
export interface OutputDesign {
  /** Sum of the voices into the drive. */
  readonly voiceGain: number;
  /** Final level. */
  readonly gain: number;
}

/** Parameter smoothing time constant, seconds. */
const SMOOTHING = 0.012;
/** Accent level easing, seconds. */
const LEVEL_EASING = 0.002;
/** Limiter threshold and release. */
const LIMIT = 0.89;
const LIMITER_RELEASE = 0.08;
/** The final soft clip keeps every sample below 1 / CLIP_HEADROOM. */
const CLIP_HEADROOM = 1.6;

export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  cutoff: 0.45,
  resonance: 0.55,
  envMod: 0.5,
  wave: 0,
  sub: 0,
  detune: 0,
  drive: 0.3,
  filterDecay: 0.3,
  attack: 0.002,
  decay: 1,
  sustain: 1,
  release: 0.008,
  transpose: 0,
};

export class VoiceEngine implements VoiceDsp {
  private readonly voices: Voice[];
  private readonly smooth: number;
  private target: EngineParams = DEFAULT_ENGINE_PARAMS;
  private readonly controls: VoiceControls;
  private drive = DEFAULT_ENGINE_PARAMS.drive;
  private limiterGain = 1;
  private clock = 0;

  /** Per-design constants: slide and accent decay. */
  private readonly slide: number;
  private readonly accentDecay: number;

  constructor(
    private readonly rate: number,
    design: VoiceDesign,
    private readonly output: OutputDesign,
    voiceCount = 1,
  ) {
    this.voices = Array.from({ length: Math.max(1, voiceCount) }, () => new Voice(design));
    this.smooth = coefficient(SMOOTHING, rate);
    this.slide = coefficient(design.slideTime, rate);
    this.accentDecay = decayFactor(design.accentDecay, rate);
    const p = DEFAULT_ENGINE_PARAMS;
    this.controls = { cutoff: p.cutoff, resonance: p.resonance, envMod: p.envMod, wave: p.wave, sub: p.sub, detune: p.detune };
  }

  setParams(params: EngineParams): void {
    this.target = params;
  }

  noteOn(id: number, midi: number, accent: boolean, legato: boolean): void {
    const pitch = midi + this.target.transpose;
    if (this.voices.length === 1) {
      this.voices[0]!.start(id, pitch, accent, legato);
      this.voices[0]!.startedAt = this.clock;
      return;
    }
    // Poly: a free voice, else the oldest one (stolen; its envelope restarts smoothly).
    const voice =
      this.voices.find((v) => !v.active) ??
      this.voices.reduce((oldest, v) => (v.startedAt < oldest.startedAt ? v : oldest));
    voice.start(id, pitch, accent, false);
    voice.startedAt = this.clock;
  }

  noteOff(id: number): void {
    for (const voice of this.voices) if (voice.id === id && voice.held) voice.release();
  }

  allOff(): void {
    for (const voice of this.voices) voice.release();
  }

  /** Voices with their gate open or still releasing. */
  get activeVoices(): number {
    return this.voices.filter((voice) => voice.active).length;
  }

  /** Frequency of the first voice (mono instruments; tests). */
  get frequency(): number {
    return this.voices[0]!.frequency;
  }

  /** Whether any voice is sounding. */
  get sounding(): boolean {
    return this.activeVoices > 0;
  }

  render(out: Float32Array, start: number, end: number): void {
    const rate = this.rate;
    const k = this.smooth;
    const p = this.target;
    const c = this.controls;
    const timing: VoiceTiming = {
      rate,
      slide: this.slide,
      attackStep: 1 / Math.max(1, p.attack * rate),
      decay: coefficient(p.decay, rate),
      sustain: clamp01(p.sustain),
      release: coefficient(p.release, rate),
      filterDecay: decayFactor(p.filterDecay, rate),
      accentDecay: this.accentDecay,
      level: coefficient(LEVEL_EASING, rate),
    };
    const limiterRelease = coefficient(LIMITER_RELEASE, rate);

    for (let i = start; i < end; i++) {
      c.cutoff += (clamp01(p.cutoff) - c.cutoff) * k;
      c.resonance += (clamp01(p.resonance) - c.resonance) * k;
      c.envMod += (clamp01(p.envMod) - c.envMod) * k;
      c.wave += (clamp01(p.wave) - c.wave) * k;
      c.sub += (clamp01(p.sub) - c.sub) * k;
      c.detune += (clamp01(p.detune) - c.detune) * k;
      this.drive += (clamp01(p.drive) - this.drive) * k;

      let sum = 0;
      for (const voice of this.voices) sum += voice.tick(c, timing);
      const push = 1 + this.drive * 8;
      const driven = softClip(sum * this.output.voiceGain * push) / (1 + this.drive * 1.5);
      const peak = Math.abs(driven);
      const wanted = peak > LIMIT ? LIMIT / peak : 1;
      this.limiterGain =
        wanted < this.limiterGain ? wanted : this.limiterGain + (1 - this.limiterGain) * limiterRelease;
      out[i] = softClip(driven * this.limiterGain * this.output.gain * CLIP_HEADROOM) / CLIP_HEADROOM;
      this.clock++;
    }
  }
}
