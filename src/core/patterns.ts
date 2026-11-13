import type { GridPatternId } from './nodes';

export const STEPS = 16;

/** Rows of 16 on/off steps. Treated as immutable. */
export type Pattern = readonly (readonly boolean[])[];

const parse = (rows: readonly string[]): Pattern =>
  rows.map((row) => Array.from(row, (char) => char === 'x'));

/**
 * Starting grids from the prototype. DRUM's becomes its first pattern; BASS starts
 * from DEFAULT_BASS_PATTERN (bass-patterns.ts), which keeps the prototype's steps.
 */
export const DEFAULT_PATTERNS: Readonly<Record<GridPatternId | 'drum', Pattern>> = {
  synth: parse(['x.x..x.x..x.x..x', '......x.......x.', 'x...x...x...x...']),
  drum: parse([
    'x...x...x...x...',
    '....x.......x...',
    '..x...x...x...x.',
    '.......x........',
  ]),
};

/** Returns a new pattern with one step flipped; out-of-range coordinates return the same pattern. */
export function toggleStep(pattern: Pattern, row: number, col: number): Pattern {
  const target = pattern[row];
  if (!target || !Number.isInteger(col) || col < 0 || col >= target.length) return pattern;
  return pattern.map((cells, r) =>
    r === row ? cells.map((on, c) => (c === col ? !on : on)) : cells,
  );
}

/** True when any row has an active step at this position. */
export const hasHitAt = (pattern: Pattern, step: number): boolean =>
  pattern.some((row) => row[step] === true);
