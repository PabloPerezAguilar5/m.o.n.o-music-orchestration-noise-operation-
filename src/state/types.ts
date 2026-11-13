import type { AudioStatus } from '../core/audio-scene';
import type { BassMode, BassPattern } from '../core/bass-patterns';
import type { ScaleId } from '../core/bass-scales';
import type { DrumPattern } from '../core/drum-patterns';
import type { Point } from '../core/geometry';
import type { DistType, GridPatternId, NodeId } from '../core/nodes';
import type { Pattern } from '../core/patterns';

export interface TransportState {
  readonly playing: boolean;
  readonly bpm: number;
  /** Current step 0..15, or -1 while stopped. */
  readonly step: number;
}

export interface DrumState {
  /** Kit id (folder in public/samples/drums). */
  readonly kit: string;
  /** Generates the pattern; never shown. Kept so a pattern can be saved and rebuilt. */
  readonly seed: number;
  /** Bumped on every regeneration (RNDM, CAOS); hand edits keep it. */
  readonly generation: number;
  readonly pattern: DrumPattern;
}

export type BassWave = 'saw' | 'square';

export interface BassState {
  /** Generates the pattern; never shown. Kept so a pattern can be saved and rebuilt. */
  readonly seed: number;
  /** Bumped on every regeneration (DICE, mode, CAOS); hand edits keep it. */
  readonly generation: number;
  /** Pattern style used by DICE (fck-synth's modes), also the voice's character. */
  readonly mode: BassMode;
  /** Tonic, 0 = C … 11 = B. */
  readonly root: number;
  readonly scale: ScaleId;
  readonly pattern: BassPattern;
  readonly wave: BassWave;
  /** Sub oscillator one octave down. */
  readonly sub: boolean;
}

/** CLICK on the MASTER panel. */
export interface MetronomeState {
  readonly on: boolean;
  /** VOL knob, 0..1. */
  readonly volume: number;
}

/** Knob values (0..1) by parameter id. */
export type ParamValues = Readonly<Record<string, number>>;

export interface AppState {
  /** Nodes on the canvas in the order they were added; 'master' is always first. */
  readonly added: readonly NodeId[];
  readonly selected: NodeId;
  /** Kept for every type, so a removed node comes back where it was. */
  readonly positions: Readonly<Record<NodeId, Point>>;
  readonly params: Readonly<Record<NodeId, ParamValues>>;
  /** On/off grid of SYNTH. DRUM's and BASS's patterns live in `drum` and `bass`. */
  readonly patterns: Readonly<Record<GridPatternId, Pattern>>;
  readonly drum: DrumState;
  readonly bass: BassState;
  /** Nodes whose cable to MASTER is cut (they stay on the canvas, silent). */
  readonly unplugged: readonly NodeId[];
  /** DRONE pad position, both axes 0..1. */
  readonly drone: Point;
  readonly distType: DistType;
  readonly transport: TransportState;
  readonly metronome: MetronomeState;
  /** Reported by the audio backend. */
  readonly audio: AudioStatus;
}
