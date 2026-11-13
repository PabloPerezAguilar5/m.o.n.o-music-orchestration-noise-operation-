import type { SynthScene } from '../../core/audio-scene';
import { SYNTH_CHARACTERS } from '../../core/synth-voices';
import { clamp01 } from '../voice/dsp-math';
import { VoiceEngine, type EngineParams, type OutputDesign } from '../voice/engine';
import type { VoiceDesign } from '../voice/voice';

/**
 * SYNTH: the same voice as BASS in another design. Two detuned oscillators per
 * voice for width, a filter that reaches higher and opens less with the envelope,
 * gentler resonance, no sub. Four voices for chords.
 */
export const SYNTH_DESIGN: VoiceDesign = {
  oscillators: 2,
  maxDetuneCents: 40, // ±20 cents at DETUNE 1
  cutoffMinHz: 90,
  cutoffOctaves: 7.1, // 90 Hz … ~12.5 kHz
  envOctaves: 3.5,
  accentOctaves: 1,
  accentResonance: 0.1,
  accentDecay: 0.15,
  normalLevel: 0.55,
  accentLevel: 0.8,
  maxFeedback: 3.4,
  slideTime: 0.04,
  inputGain: 0.6,
  subLevel: 0,
};

export const SYNTH_VOICES = 4;
/**
 * Output stage. A single note comes out about as loud as a BASS note; a full chord a
 * little louder, rounded off by the drive and caught by the limiter.
 */
export const SYNTH_OUTPUT: OutputDesign = { voiceGain: 1, gain: 1 };

/** ATAQUE knob: 2 ms … ~2 s; RELEASE knob: 10 ms … ~2.5 s (time constants, exponential). */
const ATTACK_MIN = 0.002;
const ATTACK_OCTAVES = 10;
const RELEASE_MIN = 0.01;
const RELEASE_OCTAVES = 8;

export const createSynthEngine = (rate: number): VoiceEngine =>
  new VoiceEngine(rate, SYNTH_DESIGN, SYNTH_OUTPUT, SYNTH_VOICES);

/** Engine parameters for a SYNTH scene: the six knobs on top of the preset's character. */
export function synthParamsFromScene(scene: SynthScene): EngineParams {
  const preset = SYNTH_CHARACTERS[scene.preset];
  return {
    cutoff: clamp01(scene.cutoff + preset.brightness),
    resonance: clamp01(scene.resonance + preset.resonanceShift),
    envMod: preset.envMod,
    wave: clamp01(scene.wave + preset.waveShift),
    sub: 0,
    detune: clamp01(scene.detune + preset.detuneShift),
    drive: preset.drive,
    filterDecay: preset.filterDecay,
    attack: Math.min(4, ATTACK_MIN * 2 ** (clamp01(scene.attack) * ATTACK_OCTAVES) * preset.attackScale),
    decay: preset.ampDecay,
    sustain: preset.sustain,
    release: Math.min(6, RELEASE_MIN * 2 ** (clamp01(scene.release) * RELEASE_OCTAVES) * preset.releaseScale),
    transpose: preset.transpose,
    level: preset.level,
    glide: 0,
  };
}
