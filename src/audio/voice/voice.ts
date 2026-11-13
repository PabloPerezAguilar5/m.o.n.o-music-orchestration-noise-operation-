import { polyBlep, softClip } from './dsp-math';

/**
 * One synth voice: PolyBLEP oscillators (one, or two detuned) with an optional sub
 * square, a 24 dB ladder low-pass with saturation in each stage opened by a decay
 * envelope, an amplifier envelope, accent and slide. BASS and SYNTH are two designs
 * of this same voice (see bass-voice.ts and synth-voice.ts).
 */

/** Fixed per instrument. */
export interface VoiceDesign {
  /** 1 = one oscillator; 2 = a detuned pair, for width. */
  readonly oscillators: 1 | 2;
  /** Spread between the pair at DETUNE 1, in cents. */
  readonly maxDetuneCents: number;
  /** CUTOFF range: lowest frequency and octaves above it. */
  readonly cutoffMinHz: number;
  readonly cutoffOctaves: number;
  /** How far the filter envelope opens at envMod 1, octaves. */
  readonly envOctaves: number;
  /** Accent: extra opening (octaves, with its own fast decay), resonance and level. */
  readonly accentOctaves: number;
  readonly accentResonance: number;
  readonly accentDecay: number;
  readonly normalLevel: number;
  readonly accentLevel: number;
  /** Resonance at full knob; 4 makes the ladder self-oscillate. */
  readonly maxFeedback: number;
  /** Time constant of the slide (portamento), seconds. */
  readonly slideTime: number;
  /** Oscillator level into the ladder (the ladder saturates above ~1). */
  readonly inputGain: number;
  readonly subLevel: number;
}

/** Smoothed controls, the same for every voice of an engine, for the current sample. */
export interface VoiceControls {
  cutoff: number;
  /** The LFO on CUTOFF this sample, knob units (added to cutoff, within 0..1). */
  cutoffMod: number;
  resonance: number;
  envMod: number;
  wave: number;
  sub: number;
  detune: number;
}

/** Per-sample constants of an engine, computed once per block. */
export interface VoiceTiming {
  readonly rate: number;
  readonly slide: number;
  /** Amplifier attack: linear rise per sample. */
  readonly attackStep: number;
  /** Amplifier decay towards `sustain`, and release towards 0: one-pole coefficients. */
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
  /** Envelope decays per sample (multipliers). */
  readonly filterDecay: number;
  readonly accentDecay: number;
  /** Accent level easing, one-pole. */
  readonly level: number;
  /** Hard release (cable cut), one-pole. */
  readonly cut: number;
}

type AmpStage = 'attack' | 'decay' | 'release';

/** Silence threshold of the amplifier. */
const SILENT = 1e-4;

export class Voice {
  /** Id of the note this voice is playing (0 = none). */
  id = 0;
  /** Engine sample count when the note started, to steal the oldest voice. */
  startedAt = 0;

  private phase1 = 0;
  private phase2 = 0.37; // the pair starts out of phase, so it never cancels
  private subPhase = 0;
  /** Pitch as log2(Hz), so glides are even in musical terms. */
  private pitch = Math.log2(110);
  private pitchTarget = Math.log2(110);
  private gliding = false;
  /** Whether the voice has played a note yet (portamento needs a note to glide from). */
  private played = false;

  private gate = false;
  /** Fading out fast (a hard release), until the next note. */
  private hard = false;
  private stage: AmpStage = 'release';
  private amp = 0;
  private level: number;
  private levelTarget: number;
  private filterEnv = 0;
  private accentEnv = 0;
  private accented = false;

  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  private s4 = 0;

  constructor(private readonly design: VoiceDesign) {
    this.level = design.normalLevel;
    this.levelTarget = design.normalLevel;
  }

  /** Gate open, or still releasing. */
  get active(): boolean {
    return this.gate || this.amp > SILENT;
  }

  get held(): boolean {
    return this.gate;
  }

  /** Current oscillator frequency in Hz (for tests and meters). */
  get frequency(): number {
    return 2 ** this.pitch;
  }

  /**
   * Starts a note. With `legato` and the gate open, the pitch glides and the
   * envelopes keep going (slide); otherwise the envelopes restart from where they are,
   * so a retrigger never clicks. With `portamento` a retriggered note also glides,
   * from the last note played.
   */
  start(id: number, midi: number, accent: boolean, legato: boolean, portamento = false): void {
    this.id = id;
    this.pitchTarget = Math.log2(440) + (midi - 69) / 12;
    if (legato && this.gate) {
      this.gliding = true;
      return;
    }
    this.hard = false;
    this.gliding = portamento && this.played;
    if (!this.gliding) this.pitch = this.pitchTarget;
    this.played = true;
    this.gate = true;
    this.stage = 'attack';
    this.accented = accent;
    this.levelTarget = accent ? this.design.accentLevel : this.design.normalLevel;
    this.filterEnv = 1;
    this.accentEnv = accent ? 1 : 0;
  }

  /** Closes the gate: the amplifier fades with the release time, or within milliseconds if `hard`. */
  release(hard = false): void {
    this.gate = false;
    this.stage = 'release';
    if (hard) this.hard = true;
  }

  /** One sample. `twice` is twice the sample rate (the ladder runs oversampled). */
  tick(c: VoiceControls, t: VoiceTiming): number {
    if (!this.active) return 0;
    const d = this.design;
    const rate = t.rate;

    // Pitch and oscillators.
    if (this.gliding) this.pitch += (this.pitchTarget - this.pitch) * t.slide;
    const hz = 2 ** this.pitch;
    let oscillator: number;
    if (d.oscillators === 2) {
      const spread = 2 ** ((c.detune * d.maxDetuneCents) / 2400);
      oscillator = 0.5 * (this.osc(1, (hz / spread) / rate, c.wave) + this.osc(2, (hz * spread) / rate, c.wave));
    } else {
      oscillator = this.osc(1, hz / rate, c.wave);
    }
    if (c.sub > 0) oscillator += this.subOsc(hz / 2 / rate) * c.sub * d.subLevel;

    // Envelopes.
    this.filterEnv *= t.filterDecay;
    this.accentEnv *= t.accentDecay;
    if (this.stage === 'attack') {
      this.amp += t.attackStep;
      if (this.amp >= 1) {
        this.amp = 1;
        this.stage = 'decay';
      }
    } else if (this.stage === 'decay') {
      this.amp += (t.sustain - this.amp) * t.decay;
    } else {
      this.amp -= this.amp * (this.hard ? t.cut : t.release);
    }
    this.level += (this.levelTarget - this.level) * t.level;

    // Ladder: cutoff and resonance for this sample, two passes (2x oversampling).
    const cutoff = Math.min(1, Math.max(0, c.cutoff + c.cutoffMod));
    const octaves = d.cutoffOctaves * cutoff + d.envOctaves * c.envMod * this.filterEnv + d.accentOctaves * this.accentEnv;
    const twice = rate * 2;
    const fc = Math.min(twice * 0.24, d.cutoffMinHz * 2 ** octaves);
    const g = 1 - Math.exp((-2 * Math.PI * fc) / twice);
    const feedback = d.maxFeedback * Math.min(1, c.resonance + (this.accented ? d.accentResonance * this.accentEnv : 0));
    const input = oscillator * d.inputGain;
    for (let pass = 0; pass < 2; pass++) {
      const u = softClip(input - feedback * this.s4);
      this.s1 += g * (u - softClip(this.s1));
      this.s2 += g * (softClip(this.s1) - softClip(this.s2));
      this.s3 += g * (softClip(this.s2) - softClip(this.s3));
      this.s4 += g * (softClip(this.s3) - softClip(this.s4));
    }
    // Resonance thins the low end of a ladder; give some of it back.
    const filtered = this.s4 * (1 + feedback * 0.35);
    return filtered * this.amp * this.level;
  }

  /** Saw-to-square morph (wave 0..1) of oscillator 1 or 2, PolyBLEP on every edge. */
  private osc(which: 1 | 2, dt: number, wave: number): number {
    const step = Math.min(0.5, dt);
    const phase = which === 1 ? this.phase1 : this.phase2;
    const saw = 2 * phase - 1 - polyBlep(phase, step);
    const half = phase + 0.5 - Math.floor(phase + 0.5);
    const square = (phase < 0.5 ? 1 : -1) + polyBlep(phase, step) - polyBlep(half, step);
    let next = phase + step;
    if (next >= 1) next -= 1;
    if (which === 1) this.phase1 = next;
    else this.phase2 = next;
    return saw + (square - saw) * wave;
  }

  private subOsc(dt: number): number {
    const step = Math.min(0.5, dt);
    const phase = this.subPhase;
    const half = phase + 0.5 - Math.floor(phase + 0.5);
    const square = (phase < 0.5 ? 1 : -1) + polyBlep(phase, step) - polyBlep(half, step);
    this.subPhase = phase + step >= 1 ? phase + step - 1 : phase + step;
    return square;
  }
}
