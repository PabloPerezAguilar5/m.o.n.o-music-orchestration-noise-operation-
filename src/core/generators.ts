import type { DrumRow } from './nodes';
import { STEPS } from './patterns';
import type { RandomSource } from './random';

/**
 * The eight pattern generators, ported from m.o.n.o-studio (docs/GENERATORS.md there).
 * Change from the original: a hit's offset is a fraction of a step, not seconds, so a
 * stored pattern keeps its feel when the tempo changes.
 */

export interface Hit {
  /** 0..1 */
  readonly velocity: number;
  /** Delay after the start of the step, as a fraction of a step (0..MAX_OFFSET). */
  readonly offset: number;
}

/** The hits of each of the 16 steps. An empty step is silent. */
export type HitPattern = readonly (readonly Hit[])[];

export const GENERATOR_NAMES = [
  'random',
  'riot',
  'evolve',
  'minimal',
  'dense',
  'human',
  'glitch',
  'euclid',
] as const;
export type GeneratorName = (typeof GENERATOR_NAMES)[number];

export interface GeneratorContext {
  readonly random: RandomSource;
  /** Previous result, for generators that mutate it (evolve). */
  readonly previous?: HitPattern;
  readonly row: DrumRow;
}

/** Bounds every generator output must respect. */
export const MAX_HITS_PER_STEP = 3;
export const MAX_OFFSET = 0.8;

type Draft = Hit[][];
type Generate = (args: readonly number[], context: GeneratorContext) => Draft;

const empty = (): Draft => Array.from({ length: STEPS }, () => []);
const hit = (velocity = 0.8, offset = 0): Hit => ({ velocity, offset });
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const copy = (pattern: HitPattern): Draft => pattern.map((hits) => hits.map((h) => ({ ...h })));

/** Base groove of `human` per row. Original covered kick and snare; perc is new here. */
const HUMAN_STEPS: Readonly<Record<DrumRow, readonly number[]>> = {
  kick: [0, 8],
  snare: [4, 12],
  hat: [0, 2, 4, 6, 8, 10, 12, 14],
  perc: [3, 11],
};

const GENERATORS: Readonly<Record<GeneratorName, Generate>> = {
  /** Independent coin flip per step. */
  random: ([density = 0.5], { random }) =>
    Array.from({ length: STEPS }, () => (random() < density ? [hit()] : [])),

  /** Irregular groups with accents and bursts of up to three hits. */
  riot: ([intensity = 0.5], { random }) => {
    const result = empty();
    let step = 0;
    while (step < STEPS) {
      const hits: Hit[] = [hit(step % 4 === 0 ? 1 : 0.65 + random() * 0.3)];
      if (random() < intensity * 0.65) hits.push(hit(0.55, 0.32));
      if (random() < intensity * 0.35) hits.push(hit(0.4, 0.64));
      result[step] = hits;
      step += random() < intensity ? 1 + Math.floor(random() * 2) : 3 + Math.floor(random() * 3);
    }
    return result;
  },

  /** Flips up to round(4 * amount) distinct steps of the previous pattern (or four on the floor). */
  evolve: ([amount = 0.3], { previous, random }) => {
    const result: Draft = previous
      ? copy(previous)
      : Array.from({ length: STEPS }, (_, i) => (i % 4 === 0 ? [hit()] : []));
    const mutations = Math.round(clamp(amount, 0, 1) * 4);
    const positions = Array.from({ length: STEPS }, (_, i) => i);
    for (let i = 0; i < mutations; i++) {
      const pick = i + Math.floor(random() * (STEPS - i));
      [positions[i], positions[pick]] = [positions[pick]!, positions[i]!];
      const step = positions[i]!;
      result[step] = result[step]!.length ? [] : [hit(0.6 + random() * 0.35)];
    }
    return result;
  },

  /** One to four evenly spaced hits, rotated by up to three steps. */
  minimal: ([density = 0.3], { random }) => {
    const result = empty();
    const count = Math.max(1, Math.round(density * 4));
    const rotation = Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      result[(rotation + Math.floor((i * STEPS) / count)) % STEPS] = [hit(i === 0 ? 0.9 : 0.65)];
    }
    return result;
  },

  /** All sixteen steps, minus round(8 * (1 - density)) weak ones. */
  dense: ([density = 0.8], { random }) => {
    const result: Draft = Array.from({ length: STEPS }, (_, i) => [
      hit(i % 4 === 0 ? 0.9 : 0.5 + random() * 0.25),
    ]);
    const holes = Math.round((1 - clamp(density, 0, 1)) * 8);
    const weak = Array.from({ length: 12 }, (_, i) => i + 1 + Math.floor(i / 3));
    for (let i = 0; i < holes; i++) {
      const [step] = weak.splice(Math.floor(random() * weak.length), 1);
      if (step !== undefined) result[step] = [];
    }
    return result;
  },

  /** A basic groove per row with loose velocities and late hits (up to 12% of a step). */
  human: ([amount = 0.5], { random, row }) => {
    const result = empty();
    for (const step of HUMAN_STEPS[row]) {
      result[step] = [hit(0.8 + (random() - 0.5) * 0.5 * amount, random() * 0.12 * amount)];
    }
    return result;
  },

  /** Four-step fragments: some cut, others repeated in decaying stutters. */
  glitch: ([intensity = 0.8], { random }) => {
    const result = empty();
    for (let group = 0; group < 4; group++) {
      if (random() < intensity * 0.25) continue;
      const anchor = group * 4 + Math.floor(random() * 2);
      result[anchor] = [hit(0.95)];
      const repeats = Math.floor(intensity * 3);
      for (let i = 1; i <= repeats && anchor + i < (group + 1) * 4; i++) {
        const hits: Hit[] = [hit(0.8 - i * 0.13)];
        if (random() < intensity) hits.push(hit(0.42, 0.5));
        result[anchor + i] = hits;
      }
    }
    return result;
  },

  /**
   * `pulses` spread as evenly as possible over `steps`, first hit on the first step.
   * New third argument: rotate the result by that many steps.
   */
  euclid: ([pulses = 4, steps = STEPS, rotation = 0]) => {
    const result = empty();
    const n = clamp(Math.floor(steps), 1, STEPS);
    const k = clamp(Math.floor(pulses), 0, n);
    const shift = ((Math.floor(rotation) % STEPS) + STEPS) % STEPS;
    for (let i = 0; i < STEPS; i++) {
      if (k > 0 && ((i % n) * k) % n < k) result[(i + shift) % STEPS] = [hit(i % 4 === 0 ? 0.9 : 0.75)];
    }
    return result;
  },
};

/** Runs a generator and bounds its output: 16 steps, at most 3 hits each, valid velocities and offsets. */
export function generate(
  name: GeneratorName,
  args: readonly number[],
  context: GeneratorContext,
): HitPattern {
  const draft = GENERATORS[name](args, context);
  return Array.from({ length: STEPS }, (_, step) =>
    (draft[step] ?? []).slice(0, MAX_HITS_PER_STEP).map((h) => ({
      velocity: clamp(Number.isFinite(h.velocity) ? h.velocity : 0.8, 0, 1),
      offset: clamp(Number.isFinite(h.offset) ? h.offset : 0, 0, MAX_OFFSET),
    })),
  );
}
