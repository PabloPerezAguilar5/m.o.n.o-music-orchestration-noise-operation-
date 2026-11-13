import { droneMidi, type DronePreset } from './drone';
import { clamp01 } from './geometry';
import { midiToHz, type ScaleId } from './scales';

/**
 * How a DRONE layer sounds, as plain numbers: the five presets (oscillator mix from
 * fck-synth's synthPad.ts) and the mapping from knobs and pad position to what the
 * audio sets. No Web Audio here, so the same mapping can drive a worklet later.
 */

export type DroneWave = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type DroneFilter = 'lowpass' | 'bandpass';

export interface DroneCharacter {
  /** Main oscillator. */
  readonly wave: DroneWave;
  /**
   * Levels of the sources: main, a detuned saw, a bell partial (sine × 2.76), a sub
   * (sine × 0.5) and noise (band-passed around the note). fck-synth's preset mixes.
   */
  readonly mix: readonly [number, number, number, number, number];
  readonly filter: DroneFilter;
  /** Filter Q: the preset sets the resonance (DRONE has no RESO knob). */
  readonly q: number;
  /** Semitones added to the pad's note. */
  readonly transpose: number;
  /** Multipliers of the ATAQUE and RELEASE times. */
  readonly attackScale: number;
  readonly releaseScale: number;
  /** How far the pad's upper half moves pitch (cents) and filter (octaves) at the top. */
  readonly wobble: number;
  readonly sweep: number;
  /** Sends into the node's effects, 0..1. */
  readonly delay: number;
  readonly reverb: number;
  /** Output trim, so the five sit at a similar loudness. */
  readonly level: number;
}

export const DRONE_CHARACTERS: Readonly<Record<DronePreset, DroneCharacter>> = {
  /** Dark and heavy: saw over a sub, slow to move. */
  drone: {
    wave: 'sawtooth',
    mix: [0.4, 0.08, 0, 0.38, 0],
    filter: 'lowpass',
    q: 1.5,
    transpose: 0,
    attackScale: 1,
    releaseScale: 1,
    wobble: 6,
    sweep: 1,
    delay: 0.12,
    reverb: 0.35,
    level: 0.9,
  },
  /** Soft and wide, an octave up, swelling. */
  pad: {
    wave: 'triangle',
    mix: [0.42, 0.12, 0.03, 0.12, 0],
    filter: 'lowpass',
    q: 0.8,
    transpose: 12,
    attackScale: 2,
    releaseScale: 1.5,
    wobble: 8,
    sweep: 0.8,
    delay: 0.25,
    reverb: 0.5,
    level: 1,
  },
  /** Bell partials an octave up, bright, echoing. */
  glass: {
    wave: 'sine',
    mix: [0.12, 0.07, 0.42, 0.04, 0],
    filter: 'lowpass',
    q: 3,
    transpose: 12,
    attackScale: 0.6,
    releaseScale: 1.5,
    wobble: 4,
    sweep: 1.2,
    delay: 0.4,
    reverb: 0.45,
    level: 0.55,
  },
  /** Pitched noise: a band of noise around the note. */
  noise: {
    wave: 'sine',
    mix: [0, 0, 0, 0, 0.62],
    filter: 'lowpass',
    q: 1,
    transpose: 12,
    attackScale: 1,
    releaseScale: 1,
    wobble: 30,
    sweep: 1.5,
    delay: 0.2,
    reverb: 0.55,
    level: 4,
  },
  /** Square, saw and bell through a ringing filter, wobbling. */
  alien: {
    wave: 'square',
    mix: [0.08, 0.3, 0.2, 0.04, 0],
    filter: 'lowpass',
    q: 7,
    transpose: 0,
    attackScale: 0.5,
    releaseScale: 1,
    wobble: 60,
    sweep: 2,
    delay: 0.45,
    reverb: 0.3,
    level: 1,
  },
};

/** DRONE knobs (0..1) and the key, as the audio needs them. */
export interface DroneKnobs {
  readonly filter: number;
  readonly attack: number;
  readonly release: number;
  readonly detune: number;
  readonly volume: number;
  /** CAOS: how far the sounding layers drift. */
  readonly chaos: number;
  readonly root: number;
  readonly scale: ScaleId;
}

/** Everything one layer sets, from its preset, the knobs and its place on the pad. */
export interface DroneLayerSound {
  /** Note frequency, Hz. */
  readonly frequency: number;
  /** The detuned saw, cents above the note (DESAF.). */
  readonly detune: number;
  readonly cutoff: number;
  readonly q: number;
  /** Movement (upper pad): LFO rate in Hz and its depth on pitch (cents) and cutoff (cents). */
  readonly lfoRate: number;
  readonly lfoPitch: number;
  readonly lfoCutoff: number;
  /** CAOS drift depth on pitch and cutoff, cents. */
  readonly driftPitch: number;
  readonly driftCutoff: number;
  /** Linear attack time and release time, seconds. */
  readonly attack: number;
  readonly release: number;
  /** Layer level before the effects. */
  readonly gain: number;
}

/** Level of one layer at full VOL, before sharing out among the layers. */
const LAYER_GAIN = 0.4;
/** Lowest cutoff, Hz, and octaves above it the brightness spans. */
const CUTOFF_MIN = 70;
const CUTOFF_OCTAVES = 8;

/** ATAQUE: 10 ms … ~4 s. RELEASE: 60 ms … ~6 s. Squared for a finer bottom. */
export const droneAttackTime = (knob: number): number => 0.01 + clamp01(knob) ** 2 * 4;
export const droneReleaseTime = (knob: number): number => 0.06 + clamp01(knob) ** 2 * 6;

/**
 * One layer's sound. The pad: X picks the note (droneMidi); Y opens the filter and
 * adds movement towards the top (fck-synth: brightness from the pad's height and the
 * cutoff knob). `layers` is how many sound together: each gets 1/√n of the level, so
 * six layers come out about 2.4 times one, not six.
 */
export function droneLayerSound(
  preset: DronePreset,
  knobs: DroneKnobs,
  point: { readonly x: number; readonly y: number },
  layers: number,
): DroneLayerSound {
  const character = DRONE_CHARACTERS[preset];
  const lift = 1 - clamp01(point.y);
  const brightness = clamp01(0.1 + lift * 0.5 + clamp01(knobs.filter) * 0.4);
  const midi = droneMidi(point.x, knobs.root, knobs.scale) + character.transpose;
  const movement = lift * lift;
  return {
    frequency: midiToHz(midi),
    detune: 2 + clamp01(knobs.detune) * 38,
    cutoff: Math.min(18_000, CUTOFF_MIN * 2 ** (brightness * CUTOFF_OCTAVES)),
    q: character.q,
    lfoRate: 0.08 + movement * 6,
    lfoPitch: movement * character.wobble,
    lfoCutoff: movement * character.sweep * 1200,
    driftPitch: clamp01(knobs.chaos) * 45,
    driftCutoff: clamp01(knobs.chaos) * 2400,
    attack: droneAttackTime(knobs.attack) * character.attackScale,
    release: droneReleaseTime(knobs.release) * character.releaseScale,
    gain: (clamp01(knobs.volume) ** 2 * LAYER_GAIN * character.level) / Math.sqrt(Math.max(1, layers)),
  };
}

/**
 * Rates (Hz) of the two slow oscillators that make one layer drift under CAOS. Each
 * layer gets its own pair, never in step with the others, so the layers wander apart.
 */
export function driftRates(layer: number): readonly [number, number] {
  const golden = 0.618_034;
  const a = (layer * golden) % 1;
  const b = (layer * golden * golden + 0.37) % 1;
  return [0.05 + a * 0.25, 0.11 + b * 0.4];
}
