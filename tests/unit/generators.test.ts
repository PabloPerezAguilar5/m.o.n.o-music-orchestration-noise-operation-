import { describe, expect, it } from 'vitest';
import {
  CHAOS_BANDS,
  chaosBand,
  generateDrumPattern,
  gridFromPattern,
  MANUAL_HIT,
  patternFromGrid,
  toggleDrumStep,
} from '../../src/core/drum-patterns';
import {
  generate,
  GENERATOR_NAMES,
  MAX_HITS_PER_STEP,
  MAX_OFFSET,
  type GeneratorName,
  type HitPattern,
} from '../../src/core/generators';
import { DRUM_ROWS } from '../../src/core/nodes';
import { DEFAULT_PATTERNS } from '../../src/core/patterns';
import { createRng, formatSeed, streamSeed } from '../../src/core/random';

const run = (name: GeneratorName, args: number[] = [], seed = 1, row: (typeof DRUM_ROWS)[number] = 'kick') =>
  generate(name, args, { random: createRng(seed), row });

const onSteps = (pattern: HitPattern): number[] =>
  pattern.flatMap((hits, step) => (hits.length ? [step] : []));

describe('random', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(Array.from({ length: 5 }, c)).not.toEqual(first);
    for (const value of first) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of first) expect(value).toBeLessThan(1);
  });

  it('derives independent streams by key', () => {
    expect(streamSeed(1, 'drum:kick')).toBe(streamSeed(1, 'drum:kick'));
    expect(streamSeed(1, 'drum:kick')).not.toBe(streamSeed(1, 'drum:snare'));
  });

  it('formats seeds as 8 hex digits', () => {
    expect(formatSeed(0x4d4f4e4f)).toBe('4D4F4E4F');
    expect(formatSeed(255)).toBe('000000FF');
  });
});

describe('generators', () => {
  it.each(GENERATOR_NAMES)('%s respects the bounds for any intensity', (name) => {
    for (const intensity of [0, 0.3, 0.7, 1]) {
      for (const seed of [1, 2, 3]) {
        const pattern = run(name, [intensity], seed);
        expect(pattern).toHaveLength(16);
        for (const hits of pattern) {
          expect(hits.length).toBeLessThanOrEqual(MAX_HITS_PER_STEP);
          for (const { velocity, offset } of hits) {
            expect(velocity).toBeGreaterThanOrEqual(0);
            expect(velocity).toBeLessThanOrEqual(1);
            expect(offset).toBeGreaterThanOrEqual(0);
            expect(offset).toBeLessThanOrEqual(MAX_OFFSET);
          }
        }
      }
    }
  });

  it.each(GENERATOR_NAMES)('%s gives the same result for the same seed', (name) => {
    expect(run(name, [0.6], 7)).toEqual(run(name, [0.6], 7));
  });

  it('random: 0 is silence and 1 fills every step', () => {
    expect(onSteps(run('random', [0]))).toEqual([]);
    expect(onSteps(run('random', [1]))).toHaveLength(16);
  });

  it('euclid spreads pulses evenly, first on step 0, and can rotate', () => {
    expect(onSteps(run('euclid', [4]))).toEqual([0, 4, 8, 12]);
    expect(onSteps(run('euclid', [2, 16, 4]))).toEqual([4, 12]);
    expect(onSteps(run('euclid', [0]))).toEqual([]);
    expect(onSteps(run('euclid', [16]))).toHaveLength(16);
    expect(onSteps(run('euclid', [3]))).toHaveLength(3);
  });

  it('human keeps a basic groove per row', () => {
    expect(onSteps(run('human', [0.5], 1, 'kick'))).toEqual([0, 8]);
    expect(onSteps(run('human', [0.5], 1, 'snare'))).toEqual([4, 12]);
    expect(onSteps(run('human', [0.5], 1, 'hat'))).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    // Late by at most 12% of a step.
    for (const hits of run('human', [1], 5, 'hat')) for (const h of hits) expect(h.offset).toBeLessThanOrEqual(0.12);
  });

  it('evolve flips at most round(4 * amount) steps of the previous pattern', () => {
    const base = run('euclid', [4]);
    const evolved = generate('evolve', [0.5], { random: createRng(3), row: 'kick', previous: base });
    const changed = base.filter((hits, i) => (hits.length > 0) !== (evolved[i]!.length > 0)).length;
    expect(changed).toBeLessThanOrEqual(2);
    expect(generate('evolve', [0], { random: createRng(3), row: 'kick', previous: base })).toEqual(base);
  });

  it('minimal places one to four hits', () => {
    expect(onSteps(run('minimal', [0]))).toHaveLength(1);
    expect(onSteps(run('minimal', [1]))).toHaveLength(4);
  });

  it('dense keeps between 8 and 16 hits and the strong beats', () => {
    for (const density of [0, 0.5, 1]) {
      const steps = onSteps(run('dense', [density]));
      expect(steps.length).toBeGreaterThanOrEqual(8);
      expect(steps).toEqual(expect.arrayContaining([0, 4, 8, 12]));
    }
  });
});

describe('DRUM pattern', () => {
  it('converts between on/off grids and hit patterns', () => {
    const pattern = patternFromGrid(DEFAULT_PATTERNS.drum);
    expect(pattern).toHaveLength(4);
    expect(pattern[0]?.[0]).toEqual([MANUAL_HIT]);
    expect(gridFromPattern(pattern)).toEqual(DEFAULT_PATTERNS.drum);
  });

  it('toggles one step without touching the rest', () => {
    const pattern = patternFromGrid(DEFAULT_PATTERNS.drum);
    const toggled = toggleDrumStep(pattern, 1, 0);
    expect(toggled[1]?.[0]).toEqual([MANUAL_HIT]);
    expect(toggled[0]).toBe(pattern[0]);
    expect(toggleDrumStep(toggled, 1, 0)).toEqual(pattern);
    expect(toggleDrumStep(pattern, 9, 0)).toBe(pattern);
  });

  it('maps CAOS to bands from order to chaos', () => {
    expect(chaosBand(0).band.name).toBe('ORDEN');
    expect(chaosBand(0.3).band.name).toBe('GROOVE');
    expect(chaosBand(0.5).band.name).toBe('EVOLUCION');
    expect(chaosBand(0.7).band.name).toBe('DISTURBIO');
    expect(chaosBand(1).band.name).toBe('GLITCH');
    expect(chaosBand(0.3).t).toBeCloseTo(0.5);
    expect(CHAOS_BANDS.at(-1)!.until).toBe(1);
  });

  it('is the same for the same seed and CAOS, and changes with either', () => {
    const a = generateDrumPattern(123, 0.7);
    expect(generateDrumPattern(123, 0.7)).toEqual(a);
    expect(generateDrumPattern(124, 0.7)).not.toEqual(a);
    expect(generateDrumPattern(123, 0.95)).not.toEqual(a);
  });

  it('at low CAOS is a steady groove: four on the floor and a backbeat', () => {
    const pattern = generateDrumPattern(5, 0);
    expect(onSteps(pattern[0]!)).toEqual([0, 4, 8, 12]);
    expect(onSteps(pattern[1]!)).toEqual([4, 12]);
  });

  it('gets busier and less regular as CAOS rises (average over seeds)', () => {
    const average = (chaos: number) => {
      let hits = 0;
      for (let seed = 1; seed <= 40; seed++) {
        hits += generateDrumPattern(seed, chaos).flat().reduce((n, step) => n + step.length, 0);
      }
      return hits / 40;
    };
    expect(average(0.95)).toBeGreaterThan(average(0.05));
    // At the bottom, kick, snare and hat do not depend on the seed (only perc's rotation does);
    // at the top, everything does.
    expect(generateDrumPattern(1, 0).slice(0, 3)).toEqual(generateDrumPattern(2, 0).slice(0, 3));
    expect(generateDrumPattern(1, 0.95)).not.toEqual(generateDrumPattern(2, 0.95));
  });
});
