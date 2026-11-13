import { generate, type GeneratorName, type Hit, type HitPattern } from './generators';
import { DRUM_ROWS, type DrumRow } from './nodes';
import type { Pattern } from './patterns';
import { createRng, streamSeed, type RandomSource } from './random';

/** DRUM pattern: one HitPattern per row, in DRUM_ROWS order. */
export type DrumPattern = readonly HitPattern[];

/** Seed before the first roll of the dice ("MONO" in ASCII). */
export const INITIAL_SEED = 0x4d4f4e4f;

/** A step switched on by hand. */
export const MANUAL_HIT: Hit = { velocity: 0.8, offset: 0 };

/** Converts an on/off grid to a pattern with one plain hit per active step. */
export const patternFromGrid = (grid: Pattern): DrumPattern =>
  DRUM_ROWS.map((_, row) => (grid[row] ?? []).map((on) => (on ? [MANUAL_HIT] : [])));

/** On/off view of a pattern, for the step grid. */
export const gridFromPattern = (pattern: DrumPattern): Pattern =>
  pattern.map((steps) => steps.map((hits) => hits.length > 0));

/** Returns a new pattern with one step switched on (one plain hit) or off. */
export function toggleDrumStep(pattern: DrumPattern, row: number, col: number): DrumPattern {
  const steps = pattern[row];
  if (!steps || !Number.isInteger(col) || col < 0 || col >= steps.length) return pattern;
  return pattern.map((current, r) =>
    r === row ? current.map((hits, c) => (c === col ? (hits.length ? [] : [MANUAL_HIT]) : hits)) : current,
  );
}

// CAOS ---------------------------------------------------------------------------------------

type Recipe = (t: number, random: RandomSource, row: DrumRow) => HitPattern;

const run =
  (name: GeneratorName, args: (t: number) => readonly number[]): Recipe =>
  (t, random, row) =>
    generate(name, args(t), { random, row });

/** Mutates a base pattern with `evolve`. */
const evolveFrom =
  (base: Recipe, amount: (t: number) => number): Recipe =>
  (t, random, row) =>
    generate('evolve', [amount(t)], { random, row, previous: base(t, random, row) });

const FOUR_ON_THE_FLOOR = run('euclid', () => [4]);
const BACKBEAT = run('euclid', () => [2, 16, 4]); // steps 4 and 12

export interface ChaosBand {
  /** Upper end of the band (exclusive, except the last one). */
  readonly until: number;
  readonly name: string;
  readonly rows: Readonly<Record<DrumRow, Recipe>>;
}

/**
 * CAOS sweeps the generators from order to chaos. The knob picks a band; the position
 * inside the band (t, 0..1) is the intensity passed to that band's generators.
 */
export const CHAOS_BANDS: readonly ChaosBand[] = [
  {
    until: 0.2,
    name: 'ORDEN',
    rows: {
      kick: FOUR_ON_THE_FLOOR,
      snare: BACKBEAT,
      hat: run('euclid', (t) => [4 + Math.round(t * 4), 16, 2]),
      perc: run('minimal', (t) => [t]),
    },
  },
  {
    until: 0.4,
    name: 'GROOVE',
    rows: {
      kick: run('human', (t) => [t]),
      snare: run('human', (t) => [t]),
      hat: run('human', (t) => [t]),
      perc: run('euclid', () => [3, 16, 3]),
    },
  },
  {
    until: 0.6,
    name: 'EVOLUCION',
    rows: {
      kick: evolveFrom(FOUR_ON_THE_FLOOR, (t) => 0.25 + t * 0.5),
      snare: evolveFrom(BACKBEAT, (t) => 0.25 + t * 0.5),
      hat: run('dense', (t) => [0.4 + t * 0.3]),
      perc: evolveFrom(run('minimal', () => [0.5]), (t) => 0.5 + t * 0.5),
    },
  },
  {
    until: 0.8,
    name: 'DISTURBIO',
    rows: {
      kick: run('riot', (t) => [0.2 + t * 0.4]),
      snare: evolveFrom(BACKBEAT, (t) => 0.5 + t * 0.5),
      hat: run('riot', (t) => [0.5 + t * 0.5]),
      perc: run('riot', (t) => [0.3 + t * 0.5]),
    },
  },
  {
    until: 1,
    name: 'GLITCH',
    rows: {
      kick: run('glitch', (t) => [0.4 + t * 0.6]),
      snare: run('glitch', (t) => [0.3 + t * 0.6]),
      hat: run('random', (t) => [0.45 + t * 0.45]),
      perc: run('random', (t) => [0.2 + t * 0.5]),
    },
  },
];

/** The band for a CAOS value and the position inside it (0..1). */
export function chaosBand(chaos: number): { band: ChaosBand; t: number } {
  const value = Math.min(1, Math.max(0, Number.isFinite(chaos) ? chaos : 0));
  let from = 0;
  for (const band of CHAOS_BANDS) {
    if (value < band.until || band === CHAOS_BANDS[CHAOS_BANDS.length - 1]) {
      return { band, t: Math.min(1, (value - from) / (band.until - from)) };
    }
    from = band.until;
  }
  throw new Error('unreachable');
}

/**
 * The DRUM pattern for a seed and a CAOS value. Each row draws from its own
 * stream, so the same seed and CAOS always give the same pattern.
 */
export function generateDrumPattern(seed: number, chaos: number): DrumPattern {
  const { band, t } = chaosBand(chaos);
  return DRUM_ROWS.map((row) => band.rows[row](t, createRng(streamSeed(seed, `drum:${row}`)), row));
}
