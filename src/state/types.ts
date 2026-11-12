import type { Point } from '../core/geometry';
import type { DistType, NodeId, SequencedId } from '../core/nodes';
import type { Pattern } from '../core/patterns';

export interface TransportState {
  readonly playing: boolean;
  readonly bpm: number;
  /** Current step 0..15, or -1 while stopped. */
  readonly step: number;
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
  readonly patterns: Readonly<Record<SequencedId, Pattern>>;
  /** DRONE pad position, both axes 0..1. */
  readonly drone: Point;
  readonly distType: DistType;
  readonly transport: TransportState;
}
