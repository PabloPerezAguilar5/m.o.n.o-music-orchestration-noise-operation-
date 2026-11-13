import type { NodeId } from './nodes';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Canvas coordinate space (the SVG viewBox). */
export const CANVAS = { width: 800, height: 400 } as const;

export const MASTER_POSITION: Point = { x: 400, y: 175 };

/** Where a node centre may be dragged to. */
export const NODE_BOUNDS = { minX: 48, maxX: 752, minY: 48, maxY: 335 } as const;

export const DEFAULT_POSITIONS: Readonly<Record<NodeId, Point>> = {
  master: MASTER_POSITION,
  synth: { x: 170, y: 80 },
  drum: { x: 110, y: 235 },
  bass: { x: 400, y: 325 },
  drone: { x: 630, y: 285 },
  dist: { x: 700, y: 170 },
  lfo: { x: 610, y: 62 },
  lead: { x: 390, y: 48 },
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const clampNodePosition = (point: Point): Point => ({
  x: clamp(point.x, NODE_BOUNDS.minX, NODE_BOUNDS.maxX),
  y: clamp(point.y, NODE_BOUNDS.minY, NODE_BOUNDS.maxY),
});

/** Clamps to 0..1; anything that is not a finite number becomes 0. */
export const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
