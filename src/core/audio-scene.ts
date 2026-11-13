import type { BassMode, BassPattern } from './bass-patterns';
import type { DronePreset } from './drone';
import type { DroneKnobs } from './drone-sound';
import type { ScaleId } from './scales';
import type { SynthPattern } from './synth-patterns';
import type { SynthPreset } from './synth-voices';
import type { DrumPattern } from './drum-patterns';
import type { DistSettings } from './dist';
import type { LfoShape } from './lfo';
import type { DrumRow, NodeId } from './nodes';
import type { Link } from './routing';

/**
 * What should sound, derived from the app state. The app hands a new scene to the
 * audio backend on every change; the backend decides what applies at once and what
 * waits for the next bar.
 */

export interface DrumRowScene {
  /** Knob values, 0..1. */
  readonly volume: number;
  readonly tone: number;
}

export interface DrumScene {
  readonly kit: string;
  readonly seed: number;
  /** Changes whenever the pattern is regenerated (RNDM, CAOS). Hand edits keep it. */
  readonly generation: number;
  readonly pattern: DrumPattern;
  readonly rows: Readonly<Record<DrumRow, DrumRowScene>>;
}

export interface BassScene {
  /** Changes whenever the pattern is regenerated (DICE, mode, CAOS). Hand edits keep it. */
  readonly generation: number;
  readonly pattern: BassPattern;
  readonly mode: BassMode;
  /** Tonic 0..11 and scale: which notes the degrees play. */
  readonly root: number;
  readonly scale: ScaleId;
  /** Knob values, 0..1. */
  readonly cutoff: number;
  readonly resonance: number;
  readonly decay: number;
  readonly drive: number;
  readonly wave: 'saw' | 'square';
  readonly sub: boolean;
  /** SLIDE ON/OFF. */
  readonly slides: boolean;
}

export interface SynthScene {
  /** Changes whenever the pattern is regenerated (DICE, mode, CAOS). Hand edits keep it. */
  readonly generation: number;
  readonly pattern: SynthPattern;
  readonly preset: SynthPreset;
  /** The key shared with BASS. */
  readonly root: number;
  readonly scale: ScaleId;
  /** Knob values, 0..1. */
  readonly wave: number;
  readonly cutoff: number;
  readonly resonance: number;
  readonly attack: number;
  readonly release: number;
  readonly detune: number;
}

/** LEAD knobs, 0..1. The notes come live (LiveEvent), not from the scene. */
export interface LeadScene {
  readonly wave: number;
  readonly cutoff: number;
  readonly resonance: number;
  readonly attack: number;
  readonly release: number;
  readonly glide: number;
}

/** DRONE: knobs, the preset new layers take and the key the pad is tuned to. */
export interface DroneScene extends DroneKnobs {
  readonly preset: DronePreset;
}

/** DISTORSIÓN: its type and knobs (SALIDA is its own level). */
export type DistScene = DistSettings;

/** LFO: knobs (0..1) and settings; the backend turns VELOCIDAD into a speed with the tempo. */
export interface LfoScene {
  readonly shape: LfoShape;
  readonly sync: boolean;
  readonly rate: number;
  readonly depth: number;
  readonly chaos: number;
}

export interface AudioScene {
  readonly bpm: number;
  /** Nodes on the canvas. */
  readonly nodes: readonly NodeId[];
  /**
   * Cables carrying something: plugged in (cut ones are left out), both ends on the
   * canvas. Sound cables, and the LFO's modulation cables.
   */
  readonly cables: readonly Link[];
  /** Levels of each instrument, at its output (before its cables), and MASTER's VOL. */
  readonly master: {
    /** Knob values, 0..1. */
    readonly volume: number;
    readonly drumLevel: number;
    readonly bassLevel: number;
    readonly synthLevel: number;
    readonly leadLevel: number;
    readonly droneLevel: number;
  };
  readonly drum: DrumScene;
  readonly bass: BassScene;
  readonly synth: SynthScene;
  readonly lead: LeadScene;
  readonly drone: DroneScene;
  readonly dist: DistScene;
  readonly lfo: LfoScene;
  readonly metronome: MetronomeScene;
}

export interface MetronomeScene {
  readonly on: boolean;
  /** Knob value, 0..1. */
  readonly volume: number;
}

export type AudioState = 'idle' | 'starting' | 'running' | 'blocked' | 'unavailable';

export interface AudioStatus {
  readonly state: AudioState;
  /** Kit ids from the sample manifest, once loaded. */
  readonly kits: readonly string[];
  /** Files that failed to load, by kit id. "manifest.json" when the manifest itself failed. */
  readonly missing: Readonly<Record<string, readonly string[]>>;
}

export const INITIAL_AUDIO_STATUS: AudioStatus = { state: 'idle', kits: [], missing: {} };

// Knob to gain mappings ------------------------------------------------------------------------

/** Master VOL knob: linear gain, 1 at full. */
export const masterGain = (knob: number): number => clamp01(knob);

/** Channel level on the master (e.g. DRUM): unity at half, +6 dB at full. */
export const channelGain = (knob: number): number => clamp01(knob) * 2;

/** Row volume on DRUM: squared for a natural taper, unity at 0.9. */
export const rowGain = (knob: number): number => (clamp01(knob) / 0.9) ** 2;

/** Row tone on DRUM: ±12 semitones around the centre, as a playback rate. */
export const toneRate = (knob: number): number => 2 ** (((clamp01(knob) - 0.5) * 24) / 12);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
