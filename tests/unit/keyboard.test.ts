import { describe, expect, it } from 'vitest';
import { keyboardLayout } from '../../src/core/keyboard';

describe('keyboardLayout', () => {
  const { white, black } = keyboardLayout(10);

  it('starts on C and runs C D E F G A B C D E', () => {
    expect(white.map((key) => key.label)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E']);
    expect(white.map((key) => key.semitone)).toEqual([0, 2, 4, 5, 7, 9, 11, 12, 14, 16]);
  });

  it('puts black keys between C-D, D-E, F-G, G-A and A-B only', () => {
    expect(black.map((key) => key.label)).toEqual(['C#', 'D#', 'F#', 'G#', 'A#', 'C#', 'D#']);
    expect(black.map((key) => key.semitone)).toEqual([1, 3, 6, 8, 10, 13, 15]);
    expect(black.map((key) => key.after)).toEqual([0, 1, 3, 4, 5, 7, 8]);
  });

  it('places each black key a semitone above its left white key and below its right one', () => {
    for (const key of black) {
      expect(key.semitone - white[key.after]!.semitone).toBe(1);
      expect(white[key.after + 1]!.semitone - key.semitone).toBe(1);
    }
  });

  it('has no black key between E-F or B-C', () => {
    for (let i = 0; i + 1 < white.length; i++) {
      const pair = `${white[i]!.label}-${white[i + 1]!.label}`;
      const hasBlack = black.some((key) => key.after === i);
      expect(hasBlack, pair).toBe(pair !== 'E-F' && pair !== 'B-C');
    }
  });

  it('covers every semitone exactly once', () => {
    const all = [...white, ...black].map((key) => key.semitone).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });
});
