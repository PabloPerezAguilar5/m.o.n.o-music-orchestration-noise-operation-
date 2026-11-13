import type { BassScene } from '../../core/audio-scene';
import { BASS_VOICES } from '../../core/bass-voices';
import { clamp01 } from '../voice/dsp-math';
import { VoiceEngine, type EngineParams, type OutputDesign } from '../voice/engine';
import type { VoiceDesign } from '../voice/voice';

/** BASS: a TB-303-style mono voice. One oscillator (+ sub), deep filter sweep, accent and slide. */
export const BASS_DESIGN: VoiceDesign = {
  oscillators: 1,
  maxDetuneCents: 0,
  cutoffMinHz: 40,
  cutoffOctaves: 7.35, // 40 Hz … ~6.5 kHz
  envOctaves: 4.5,
  accentOctaves: 1.6,
  accentResonance: 0.15,
  accentDecay: 0.12, // the 303 accent "wow"
  normalLevel: 0.62,
  accentLevel: 1,
  maxFeedback: 3.9,
  slideTime: 0.025, // reaches the note in ~60 ms, like the 303
  inputGain: 0.5,
  subLevel: 0.6,
};

export const BASS_OUTPUT: OutputDesign = { voiceGain: 1, gain: 0.55 };

/** DECAY knob: 40 ms … ~2.5 s, exponential (6 octaves of time). */
export const DECAY_MIN = 0.04;
export const DECAY_OCTAVES = 6;

export const createBassEngine = (rate: number): VoiceEngine => new VoiceEngine(rate, BASS_DESIGN, BASS_OUTPUT, 1);

/**
 * Engine parameters for a BASS scene: the knobs, shaped by the mode's character
 * (envelope depth, decay scale, extra drive), and the wave and sub keys.
 */
export function bassParamsFromScene(scene: BassScene): EngineParams {
  const voice = BASS_VOICES[scene.mode];
  return {
    cutoff: scene.cutoff,
    resonance: scene.resonance,
    envMod: voice.envMod,
    wave: scene.wave === 'square' ? 1 : 0,
    sub: scene.sub ? 1 : 0,
    detune: 0,
    drive: clamp01(scene.drive + voice.drive),
    filterDecay: DECAY_MIN * 2 ** (clamp01(scene.decay) * DECAY_OCTAVES) * voice.decay,
    // The 303 amplifier: open while the gate is, short ends against clicks.
    attack: 0.002,
    decay: 1,
    sustain: 1,
    release: 0.008,
    transpose: 0,
    level: 1,
    glide: 0,
  };
}
