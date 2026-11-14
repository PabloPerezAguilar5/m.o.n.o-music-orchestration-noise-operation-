import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assignSlice,
  barSeconds,
  DEFAULT_SLICE_PATTERN,
  EMPTY_SLICE_PATTERN,
  gateFraction,
  generateSlicePattern,
  loopBar,
  loopsIn,
  parseBassManifest,
  pitchSemitones,
  sameSlicePattern,
  SLICE_CATEGORIES,
  SLICE_DICE_MODES,
  SliceSequencer,
  sliceRate,
  sliceSeconds,
  slicesOf,
  sliceWindow,
  SLICES,
} from '../../src/core/slice';
import { stepDuration } from '../../src/core/transport';

const MANIFEST = fileURLToPath(new URL('../../public/samples/bass/manifest.json', import.meta.url));

const ONE_BAR = { bpm: 128, bars: 1 };
const FOUR_BARS = { bpm: 128, bars: 4 };

describe('cut points (bpm and bars, not the file)', () => {
  it('a bar at 128 BPM is 1.875 s and a piece 117.1875 ms', () => {
    expect(barSeconds(128)).toBeCloseTo(1.875, 9);
    expect(sliceSeconds(128)).toBeCloseTo(0.1171875, 9);
  });

  it('a 1-bar loop: 16 contiguous pieces from 0 to 1.875 s', () => {
    const windows = Array.from({ length: SLICES }, (_, i) => sliceWindow(ONE_BAR, 0, i));
    expect(windows[0]).toEqual({ start: 0, end: 0.1171875 });
    expect(windows[15]!.end).toBeCloseTo(1.875, 9);
    for (let i = 1; i < SLICES; i++) expect(windows[i]!.start).toBeCloseTo(windows[i - 1]!.end, 9);
    for (const w of windows) expect(w.end - w.start).toBeCloseTo(sliceSeconds(128), 9);
  });

  it('a 4-bar loop: each bar starts a bar later; the last piece ends at 7.5 s', () => {
    expect(sliceWindow(FOUR_BARS, 0, 0).start).toBe(0);
    expect(sliceWindow(FOUR_BARS, 1, 0).start).toBeCloseTo(1.875, 9);
    expect(sliceWindow(FOUR_BARS, 2, 0).start).toBeCloseTo(3.75, 9);
    expect(sliceWindow(FOUR_BARS, 3, 0).start).toBeCloseTo(5.625, 9);
    expect(sliceWindow(FOUR_BARS, 3, 15).end).toBeCloseTo(7.5, 9);
    expect(sliceWindow(FOUR_BARS, 1, 5)).toEqual({ start: 1.875 + 5 * 0.1171875, end: 1.875 + 6 * 0.1171875 });
  });

  it('a bar past the loop clamps to its last bar; a 1-bar loop only has bar 1', () => {
    expect(sliceWindow(ONE_BAR, 3, 2)).toEqual(sliceWindow(ONE_BAR, 0, 2));
    expect(sliceWindow(FOUR_BARS, 9, 0)).toEqual(sliceWindow(FOUR_BARS, 3, 0));
    expect(sliceWindow(FOUR_BARS, -1, 0)).toEqual(sliceWindow(FOUR_BARS, 0, 0));
  });
});

describe('default pattern', () => {
  it('step N plays piece N, every step on: the original loop', () => {
    expect(slicesOf(DEFAULT_SLICE_PATTERN)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(DEFAULT_SLICE_PATTERN.every((step) => step.on && !step.reverse)).toBe(true);
  });

  it('sequenced with SYNC at 128 BPM it plays the file back untouched: each piece at its step, at speed 1', () => {
    const sequencer = new SliceSequencer();
    const duration = stepDuration(128);
    let cursor = 0;
    for (let step = 0; step < 16; step++) {
      const event = sequencer.step(DEFAULT_SLICE_PATTERN, step, 1, 0, false, step * duration, duration);
      expect(event).not.toBeNull();
      const window = sliceWindow(ONE_BAR, event!.bar, event!.slice);
      // The piece starts in the file exactly where the step starts in the bar …
      expect(window.start).toBeCloseTo(cursor, 9);
      expect(window.start).toBeCloseTo(event!.time, 9);
      // … and lasts exactly a step at speed 1, so the pieces join seamlessly.
      expect(sliceRate(true, 128, 128, 0.5)).toBe(1);
      expect((window.end - window.start) * gateFraction(1)).toBeCloseTo(duration, 9);
      expect(event!.reverse).toBe(false);
      cursor = window.end;
    }
    expect(cursor).toBeCloseTo(1.875, 9);
  });

  it('BORRAR keeps the pieces and switches every step off', () => {
    expect(EMPTY_SLICE_PATTERN.every((step, i) => !step.on && step.slice === i)).toBe(true);
  });
});

describe('speed (SYNC and PITCH)', () => {
  it('SYNC: master BPM over loop BPM, like a record', () => {
    expect(sliceRate(true, 128, 128, 0.5)).toBe(1);
    expect(sliceRate(true, 120, 128, 0.5)).toBeCloseTo(0.9375, 9);
    expect(sliceRate(true, 256, 128, 0.5)).toBe(2);
    expect(sliceRate(true, 64, 128, 0.5)).toBe(0.5);
  });

  it('without SYNC the loop plays at its natural speed whatever the tempo', () => {
    expect(sliceRate(false, 40, 128, 0.5)).toBe(1);
    expect(sliceRate(false, 300, 128, 0.5)).toBe(1);
  });

  it('PITCH: whole semitones, ±12, an octave each way', () => {
    expect(pitchSemitones(0.5)).toBe(0);
    expect(pitchSemitones(1)).toBe(12);
    expect(pitchSemitones(0)).toBe(-12);
    expect(sliceRate(false, 128, 128, 1)).toBeCloseTo(2, 9);
    expect(sliceRate(false, 128, 128, 0)).toBeCloseTo(0.5, 9);
    expect(sliceRate(true, 64, 128, 1)).toBeCloseTo(1, 9);
  });

  it('a synced piece lasts exactly one step at any tempo', () => {
    for (const bpm of [40, 90, 128, 174, 300]) {
      const seconds = sliceSeconds(128) / sliceRate(true, bpm, 128, 0.5);
      expect(seconds).toBeCloseTo(stepDuration(bpm), 9);
    }
  });

  it('GATE: the whole piece at 1, a tenth at 0', () => {
    expect(gateFraction(1)).toBe(1);
    expect(gateFraction(0)).toBeCloseTo(0.1, 9);
  });
});

describe('editing', () => {
  it('a tap puts the picked piece on the step; the same again switches it off', () => {
    const once = assignSlice(DEFAULT_SLICE_PATTERN, 3, 7);
    expect(once[3]).toEqual({ on: true, slice: 7, reverse: false });
    const twice = assignSlice(once, 3, 7);
    expect(twice[3]).toEqual({ on: false, slice: 7, reverse: false });
    // Off, then tapped with another piece: on again with that piece.
    expect(assignSlice(twice, 3, 2)[3]).toEqual({ on: true, slice: 2, reverse: false });
    // Other steps untouched.
    expect(once.filter((_, i) => i !== 3)).toEqual(DEFAULT_SLICE_PATTERN.filter((_, i) => i !== 3));
  });

  it('ignores pieces and steps out of range', () => {
    expect(assignSlice(DEFAULT_SLICE_PATTERN, 16, 0)).toBe(DEFAULT_SLICE_PATTERN);
    expect(assignSlice(DEFAULT_SLICE_PATTERN, 0, 16)).toBe(DEFAULT_SLICE_PATTERN);
    expect(assignSlice(DEFAULT_SLICE_PATTERN, 0, -1)).toBe(DEFAULT_SLICE_PATTERN);
  });
});

describe('DICE', () => {
  const inRange = (slice: number) => Number.isInteger(slice) && slice >= 0 && slice < 16;

  for (const mode of SLICE_DICE_MODES) {
    describe(mode, () => {
      it('is reproducible from mode, seed and CAOS, and never the untouched original', () => {
        for (const seed of [1, 2, 3, 42, 0xdeadbeef]) {
          for (const chaos of [0, 0.5, 1]) {
            const a = generateSlicePattern(mode, seed, chaos);
            const b = generateSlicePattern(mode, seed, chaos);
            expect(a).toEqual(b);
            expect(a).toHaveLength(16);
            expect(a.every((step) => inRange(step.slice))).toBe(true);
            expect(sameSlicePattern(a, DEFAULT_SLICE_PATTERN), `${mode} seed ${seed} chaos ${chaos}`).toBe(false);
          }
        }
      });

      it('different seeds give different patterns', () => {
        const patterns = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(generateSlicePattern(mode, seed, 0.3))));
        expect(patterns.size).toBeGreaterThan(3);
      });
    });
  }

  it('ORIGINAL keeps most of the order at CAOS 0 and changes more with CAOS', () => {
    const changes = (chaos: number) =>
      [1, 2, 3, 4, 5, 6, 7, 8].reduce((sum, seed) => {
        const pattern = generateSlicePattern('original', seed, chaos);
        return sum + pattern.filter((step, i) => step.on !== true || step.slice !== i || step.reverse).length;
      }, 0) / 8;
    expect(changes(0)).toBeGreaterThanOrEqual(1);
    expect(changes(0)).toBeLessThan(5);
    expect(changes(1)).toBeGreaterThan(changes(0));
  });

  it('SHUFFLE at CAOS 0 reorders the pieces: every piece once, every step on', () => {
    for (const seed of [1, 2, 3]) {
      const pattern = generateSlicePattern('shuffle', seed, 0);
      expect([...pattern.map((step) => step.slice)].sort((a, b) => a - b)).toEqual(slicesOf(DEFAULT_SLICE_PATTERN));
      expect(pattern.every((step) => step.on && !step.reverse)).toBe(true);
    }
  });

  it('STUTTER repeats pieces', () => {
    for (const seed of [1, 2, 3]) {
      const pattern = generateSlicePattern('stutter', seed, 0);
      const repeats = pattern.filter((step, i) => i > 0 && step.slice === pattern[i - 1]!.slice).length;
      expect(repeats, `seed ${seed}`).toBeGreaterThan(3);
    }
  });

  it('CHAOS reverses and skips pieces, more with CAOS', () => {
    const count = (chaos: number, pick: (step: { on: boolean; reverse: boolean }) => boolean) =>
      [1, 2, 3, 4, 5, 6, 7, 8].reduce((sum, seed) => sum + generateSlicePattern('chaos', seed, chaos).filter(pick).length, 0);
    expect(count(0, (step) => step.reverse)).toBeGreaterThan(0);
    expect(count(1, (step) => step.reverse)).toBeGreaterThan(count(0, (step) => step.reverse));
    expect(count(1, (step) => !step.on)).toBeGreaterThan(count(0, (step) => !step.on));
  });
});

describe('BAR and AUTO', () => {
  it('a fixed bar stays, within the loop', () => {
    expect(loopBar(2, 0, 4)).toBe(2);
    expect(loopBar(2, 7, 4)).toBe(2);
    expect(loopBar(3, 0, 1)).toBe(0);
  });

  it('AUTO advances a bar every time the pattern wraps, around the loop', () => {
    expect([0, 1, 2, 3, 4, 5].map((cycle) => loopBar('auto', cycle, 4))).toEqual([0, 1, 2, 3, 0, 1]);
    expect([0, 1, 2].map((cycle) => loopBar('auto', cycle, 1))).toEqual([0, 0, 0]);
  });

  it('the sequencer counts the cycles: AUTO over a 4-bar loop, then reset', () => {
    const sequencer = new SliceSequencer();
    const bars: number[] = [];
    for (let tick = 0; tick < 16 * 5; tick++) {
      const event = sequencer.step(DEFAULT_SLICE_PATTERN, tick % 16, 4, 'auto', false, tick * 0.1, 0.1);
      if (tick % 16 === 0) bars.push(event!.bar);
    }
    expect(bars).toEqual([0, 1, 2, 3, 0]);
    expect(sequencer.currentBar).toBe(0);
    sequencer.step(DEFAULT_SLICE_PATTERN, 0, 4, 'auto', false, 0, 0.1);
    expect(sequencer.currentBar).toBe(1);
    sequencer.reset();
    expect(sequencer.step(DEFAULT_SLICE_PATTERN, 0, 4, 'auto', false, 0, 0.1)!.bar).toBe(0);
  });

  it('on a 1-bar loop AUTO always plays bar 1; a fixed BAR past the loop clamps', () => {
    const sequencer = new SliceSequencer();
    for (let tick = 0; tick < 48; tick++) {
      expect(sequencer.step(DEFAULT_SLICE_PATTERN, tick % 16, 1, 'auto', false, 0, 0.1)!.bar).toBe(0);
    }
    expect(sequencer.step(DEFAULT_SLICE_PATTERN, 0, 1, 3, false, 0, 0.1)!.bar).toBe(0);
  });

  it('silent steps give nothing; REVERSE flips each step\'s own mark', () => {
    const sequencer = new SliceSequencer();
    const pattern = assignSlice(DEFAULT_SLICE_PATTERN, 1, 1); // step 2 off
    expect(sequencer.step(pattern, 1, 1, 0, false, 0, 0.1)).toBeNull();
    const marked = pattern.map((step, i) => (i === 2 ? { ...step, reverse: true } : step));
    expect(sequencer.step(marked, 2, 1, 0, false, 0, 0.1)!.reverse).toBe(true);
    expect(sequencer.step(marked, 2, 1, 0, true, 0, 0.1)!.reverse).toBe(false);
    expect(sequencer.step(marked, 3, 1, 0, true, 0, 0.1)!.reverse).toBe(true);
  });
});

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as unknown;

  it('reads the 63 loops of the five sets and skips note', () => {
    const loops = parseBassManifest(manifest);
    expect(loops).toHaveLength(63);
    expect(SLICE_CATEGORIES.map((set) => loopsIn(loops, set).length)).toEqual([14, 14, 14, 7, 14]);
    expect(loops.every((loop) => loop.bpm === 128)).toBe(true);
    expect(loopsIn(loops, 'line').every((loop) => loop.bars === 1)).toBe(true);
    expect(loopsIn(loops, 'arp').every((loop) => loop.bars === 4)).toBe(true);
    expect(loops.find((loop) => loop.set === 'line' && loop.file === 'a-128-c.wav')).toMatchObject({
      variant: 'a',
      key: 'C',
    });
  });

  it('rejects another version or bad entries', () => {
    expect(() => parseBassManifest({ version: 2, sets: [] })).toThrow(/version/);
    expect(() => parseBassManifest({ version: 1, sets: [{ id: 'line', files: [{ file: 'Bad Name.wav' }] }] })).toThrow(
      /file name/,
    );
    expect(() =>
      parseBassManifest({ version: 1, sets: [{ id: 'line', files: [{ file: 'a-128-c.wav', bars: 0, bpm: 128 }] }] }),
    ).toThrow(/bars/);
  });
});
