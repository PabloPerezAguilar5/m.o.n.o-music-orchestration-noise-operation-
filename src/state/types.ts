import type { AudioStatus } from '../core/audio-scene';
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
  /** On/off grids of SYNTH and BASS. DRUM's pattern lives in `drum`. */
  readonly patterns: Readonly<Record<GridPatternId, Pattern>>;
  readonly drum: DrumState;
  /** DRONE pad position, both axes 0..1. */
  readonly drone: Point;
  readonly distType: DistType;
  readonly transport: TransportState;
  readonly metronome: MetronomeState;
  /** Reported by the audio backend. */
  readonly audio: AudioStatus;
}
