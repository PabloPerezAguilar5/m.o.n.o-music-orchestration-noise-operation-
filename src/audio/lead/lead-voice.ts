import type { LeadScene } from '../../core/audio-scene';
import { leadAttackTime, leadGlideTime, leadReleaseTime } from '../../core/lead';
import { clamp01 } from '../voice/dsp-math';
import { VoiceEngine, type EngineParams, type OutputDesign } from '../voice/engine';
import type { VoiceDesign } from '../voice/voice';

/**
 * LEAD: the SYNTH's voice played live, mono. Two oscillators a few cents apart for
 * body, a filter that reaches high, a light envelope sweep on each note, near-instant
 * legato between fingers (GLIDE sets a slower portamento).
 */
export const LEAD_DESIGN: VoiceDesign = {
  oscillators: 2,
  maxDetuneCents: 14,
  cutoffMinHz: 110,
  cutoffOctaves: 7, // 110 Hz … ~14 kHz
  envOctaves: 2.5,
  accentOctaves: 1.4,
  accentResonance: 0.15,
  accentDecay: 0.18,
  normalLevel: 0.6,
  accentLevel: 0.85,
  maxFeedback: 3.6,
  slideTime: 0.004, // GLIDE at 0: legato changes note at once, without a click
  inputGain: 0.6,
  subLevel: 0,
};

export const LEAD_OUTPUT: OutputDesign = { voiceGain: 1, gain: 0.9 };

export const createLeadEngine = (rate: number): VoiceEngine => new VoiceEngine(rate, LEAD_DESIGN, LEAD_OUTPUT, 1);

/** Engine parameters for the LEAD knobs. */
export function leadParamsFromScene(scene: LeadScene): EngineParams {
  return {
    cutoff: clamp01(scene.cutoff),
    resonance: clamp01(scene.resonance),
    envMod: 0.35,
    wave: clamp01(scene.wave),
    sub: 0,
    detune: 0.5,
    drive: 0.15,
    filterDecay: 0.35,
    attack: leadAttackTime(scene.attack),
    decay: 0.6,
    sustain: 0.8,
    release: leadReleaseTime(scene.release),
    transpose: 0,
    level: 1,
    glide: leadGlideTime(scene.glide),
  };
}
