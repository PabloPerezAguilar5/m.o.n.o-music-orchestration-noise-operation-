/** Seeded randomness (Mulberry32), ported from m.o.n.o-studio. Generators never use Math.random. */

export type RandomSource = () => number;

/** Deterministic stream of numbers in [0, 1) for a 32-bit seed. */
export function createRng(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed of an independent stream: the same seed and key always give the same stream. */
export function streamSeed(seed: number, key: string): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

/** A fresh seed for RNDM. The one place randomness is not reproducible, by design. */
export function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 0;
}
