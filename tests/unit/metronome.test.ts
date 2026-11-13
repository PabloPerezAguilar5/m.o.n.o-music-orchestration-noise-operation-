import { describe, expect, it } from 'vitest';
import { clickAt, clickGain } from '../../src/core/metronome';

describe('metronome', () => {
  it('clicks on every beat of the bar, accented on beat 1', () => {
    const clicks = Array.from({ length: 16 }, (_, step) => clickAt(step));
    expect(clicks.flatMap((click, step) => (click ? [step] : []))).toEqual([0, 4, 8, 12]);
    expect(clicks[0]).toBe('accent');
    expect([clicks[4], clicks[8], clicks[12]]).toEqual(['beat', 'beat', 'beat']);
  });

  it('is silent while stopped (step -1) and on invalid steps', () => {
    expect(clickAt(-1)).toBeNull();
    expect(clickAt(2.5)).toBeNull();
  });

  it('maps the VOL knob to a gain from 0 to 1', () => {
    expect(clickGain(0)).toBe(0);
    expect(clickGain(1)).toBe(1);
    expect(clickGain(0.5)).toBeCloseTo(0.25);
    expect(clickGain(Number.NaN)).toBe(0);
  });
});
