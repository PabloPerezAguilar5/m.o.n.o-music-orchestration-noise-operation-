import { beforeEach, describe, expect, it } from 'vitest';
import {
  BASS_ACCENT_ROW,
  BASS_MODES,
  BASS_SLIDE_ROW,
  BassSequencer,
  DEFAULT_BASS_PATTERN,
  GATE_FRACTION,
  generateBassPattern,
  gridFromBassPattern,
  rowOfDegree,
  toggleBassCell,
  type BassEvent,
  type BassPattern,
  type BassStep,
} from '../../src/core/bass-patterns';
import { bassMidi, degreeName, midiToHz, ROOTS, SCALE_IDS, SCALE_INTERVALS } from '../../src/core/scales';
import { STEPS } from '../../src/core/patterns';
import { Store } from '../../src/state/store';

const C = 0;
const midiOf = (degree: number) => bassMidi(C, 'pentaMinor', degree);
const rest: BassStep = { note: null, slide: false, accent: false, length: 1 };
/** A pattern from a few steps; the rest are rests. */
const patternOf = (steps: Record<number, Partial<BassStep>>): BassPattern =>
  Array.from({ length: STEPS }, (_, i) => ({ ...rest, ...(steps[i] ? { note: 0, ...steps[i] } : {}) }));

describe('bass scales', () => {
  it('has twelve tonics and four five-note scales starting on the tonic', () => {
    expect(ROOTS).toHaveLength(12);
    for (const scale of SCALE_IDS) {
      const intervals = SCALE_INTERVALS[scale];
      expect(intervals).toHaveLength(5);
      expect(intervals[0]).toBe(0);
      expect([...intervals].sort((a, b) => a - b)).toEqual(intervals);
    }
  });

  it('places degrees from C2 up, as in fck-synth', () => {
    expect(bassMidi(C, 'pentaMinor', 0)).toBe(36); // C2
    expect(bassMidi(C, 'pentaMinor', 4)).toBe(46); // Bb2
    expect(bassMidi(9, 'minor', 0)).toBe(45); // A2
    expect(bassMidi(9, 'major', 2)).toBe(49); // C#3
    expect(degreeName(C, 'pentaMinor', 1)).toBe('Eb');
    expect(degreeName(7, 'dorian', 4)).toBe('E');
  });

  it('clamps degrees and wraps tonics', () => {
    expect(bassMidi(C, 'minor', 9)).toBe(bassMidi(C, 'minor', 4));
    expect(bassMidi(12, 'minor', 0)).toBe(bassMidi(0, 'minor', 0));
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(36)).toBeCloseTo(65.41, 2);
  });
});

describe('bass patterns', () => {
  it('starts from the prototype steps: notes, slides and accents', () => {
    const on = (pick: (s: BassStep) => boolean) =>
      DEFAULT_BASS_PATTERN.flatMap((step, i) => (pick(step) ? [i] : []));
    expect(on((s) => s.note !== null)).toEqual([0, 3, 6, 8, 11, 13]);
    expect(on((s) => s.slide)).toEqual([3, 13]);
    expect(on((s) => s.accent)).toEqual([0, 6]);
  });

  it('shows five note rows, highest on top, then SLD and ACC', () => {
    const grid = gridFromBassPattern(patternOf({ 2: { note: 4, slide: true }, 5: { note: 0, accent: true } }));
    expect(grid).toHaveLength(7);
    expect(grid[rowOfDegree(4)]?.[2]).toBe(true);
    expect(grid[0]?.[2]).toBe(true); // degree 4 is the top row
    expect(grid[4]?.[5]).toBe(true); // the tonic is the bottom note row
    expect(grid[BASS_SLIDE_ROW]?.[2]).toBe(true);
    expect(grid[BASS_ACCENT_ROW]?.[5]).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(4);
  });

  it('a tap on a note row sets that note, a second tap makes a rest', () => {
    let pattern = patternOf({});
    pattern = toggleBassCell(pattern, rowOfDegree(3), 7);
    expect(pattern[7]?.note).toBe(3);
    pattern = toggleBassCell(pattern, rowOfDegree(1), 7); // another note replaces it
    expect(pattern[7]?.note).toBe(1);
    pattern = toggleBassCell(pattern, rowOfDegree(1), 7);
    expect(pattern[7]?.note).toBeNull();
  });

  it('SLD and ACC flip on their own; bad coordinates change nothing', () => {
    const pattern = patternOf({ 4: {} });
    const slid = toggleBassCell(pattern, BASS_SLIDE_ROW, 4);
    expect(slid[4]).toMatchObject({ note: 0, slide: true, accent: false });
    expect(toggleBassCell(slid, BASS_ACCENT_ROW, 4)[4]).toMatchObject({ slide: true, accent: true });
    expect(pattern[4]?.slide).toBe(false); // not mutated
    expect(toggleBassCell(pattern, 7, 0)).toBe(pattern);
    expect(toggleBassCell(pattern, 0, 16)).toBe(pattern);
  });

  it.each(BASS_MODES)('%s is reproducible per seed and stays in range', (mode) => {
    const a = generateBassPattern(mode, 1234, 0.3);
    expect(generateBassPattern(mode, 1234, 0.3)).toEqual(a);
    expect(a).toHaveLength(STEPS);
    expect(a[0]?.note).not.toBeNull(); // every mode starts on the downbeat
    for (const step of a) {
      if (step.note !== null) expect(step.note).toBeGreaterThanOrEqual(0);
      if (step.note !== null) expect(step.note).toBeLessThanOrEqual(4);
      expect(step.length).toBeGreaterThanOrEqual(1);
    }
    const others = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(generateBassPattern(mode, seed * 977, 0.3))));
    expect(others.size).toBeGreaterThan(1);
  });

  it('keeps each mode\'s character from fck-synth', () => {
    const notes = (p: BassPattern) => p.flatMap((s, i) => (s.note !== null ? [i] : []));
    expect(notes(generateBassPattern('pulse', 7, 0))).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    const drone = generateBassPattern('drone', 7, 0);
    expect(notes(drone)).toEqual([0, 8]);
    expect(drone[0]?.length).toBe(6);
    expect(drone[0]?.note).toBe(0); // on the tonic
  });

  it('CAOS adds notes, accents and slides (average over seeds)', () => {
    const count = (chaos: number, pick: (s: BassStep) => boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) n += generateBassPattern('broken', seed, chaos).filter(pick).length;
      return n;
    };
    expect(count(1, (s) => s.note !== null)).toBeGreaterThan(count(0, (s) => s.note !== null));
    expect(count(1, (s) => s.slide)).toBeGreaterThan(count(0, (s) => s.slide));
    expect(count(1, (s) => s.accent)).toBeGreaterThan(count(0, (s) => s.accent));
  });
});

describe('bass sequence', () => {
  const run = (pattern: BassPattern, steps = STEPS, gate = 1): BassEvent[] => {
    const sequencer = new BassSequencer();
    return Array.from({ length: steps }, (_, i) =>
      sequencer.step(pattern, i % STEPS, i * 0.125, 0.125, midiOf, gate),
    ).flat();
  };

  it('plays each note at its step time, in its key, and releases it within the step', () => {
    const events = run(patternOf({ 0: { note: 0 }, 4: { note: 2 } }));
    expect(events).toEqual([
      { type: 'on', time: 0, id: 1, midi: 36, accent: false, legato: false },
      { type: 'off', time: 0.125 * GATE_FRACTION, id: 1 },
      { type: 'on', time: 0.5, id: 2, midi: 41, accent: false, legato: false },
      { type: 'off', time: 0.5 + 0.125 * GATE_FRACTION, id: 2 },
    ]);
  });

  it('passes accents to the voice', () => {
    const ons = run(patternOf({ 0: { accent: true }, 2: {} })).filter((e) => e.type === 'on');
    expect(ons.map((e) => e.type === 'on' && e.accent)).toEqual([true, false]);
  });

  it('slide: holds the note and glides into the next one without retriggering', () => {
    const events = run(patternOf({ 0: { note: 0, slide: true }, 1: { note: 4 } }));
    expect(events).toEqual([
      { type: 'on', time: 0, id: 1, midi: 36, accent: false, legato: false },
      { type: 'on', time: 0.125, id: 2, midi: 46, accent: false, legato: true },
      { type: 'off', time: 0.125 + 0.125 * GATE_FRACTION, id: 2 },
    ]);
  });

  it('a chain of slides stays legato to the last note', () => {
    const events = run(patternOf({ 0: { slide: true }, 1: { note: 1, slide: true }, 2: { note: 2 } }));
    expect(events.filter((e) => e.type === 'on').map((e) => e.type === 'on' && e.legato)).toEqual([false, true, true]);
    expect(events.filter((e) => e.type === 'off')).toHaveLength(1);
  });

  it('a slide into a rest just holds the note for the whole step', () => {
    const events = run(patternOf({ 0: { slide: true } }));
    expect(events).toEqual([
      { type: 'on', time: 0, id: 1, midi: 36, accent: false, legato: false },
      { type: 'off', time: 0.125, id: 1 },
    ]);
  });

  it('a slide on the last step glides into the first note of the next bar', () => {
    const events = run(patternOf({ 0: {}, 15: { slide: true } }), STEPS + 1);
    const last = events.filter((e) => e.type === 'on').at(-1);
    expect(last).toMatchObject({ time: 2, legato: true });
  });

  it('longer notes and the mode gate stretch the release', () => {
    const [, off] = run(patternOf({ 0: { length: 6 } }), STEPS, 1.6);
    expect(off).toMatchObject({ type: 'off', time: 6 * GATE_FRACTION * 1.6 * 0.125 });
  });

  it('reset forgets a held note, so the next one retriggers', () => {
    const sequencer = new BassSequencer();
    const pattern = patternOf({ 0: { slide: true }, 1: {} });
    sequencer.step(pattern, 0, 0, 0.125, midiOf);
    sequencer.reset();
    expect(sequencer.step(pattern, 1, 0.125, 0.125, midiOf)[0]).toMatchObject({ legato: false });
  });
});

describe('BASS in the store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store();
  });

  it('starts in C minor pentatonic, PULSE, saw, no sub, with the prototype steps', () => {
    expect(store.getState().key).toEqual({ root: 0, scale: 'pentaMinor' });
    expect(store.getState().bass).toMatchObject({
      mode: 'pulse',
      wave: 'saw',
      sub: false,
      generation: 0,
      pattern: DEFAULT_BASS_PATTERN,
    });
  });

  it('DICE: a new seed and pattern in the current mode, always different on the grid', () => {
    let seed = 0;
    for (let press = 0; press < 20; press++) {
      const before = store.getState().bass;
      store.randomizeBass(() => (seed += 7919));
      const after = store.getState().bass;
      expect(after.generation).toBe(before.generation + 1);
      expect(gridFromBassPattern(after.pattern)).not.toEqual(gridFromBassPattern(before.pattern));
      expect(after.pattern).toEqual(generateBassPattern('pulse', after.seed, 0.2));
    }
  });

  it('a mode regenerates from the same seed; CAOS too', () => {
    store.randomizeBass(() => 42);
    store.setBassMode('dirty');
    expect(store.getState().bass).toMatchObject({ mode: 'dirty', seed: 42 });
    expect(store.getState().bass.pattern).toEqual(generateBassPattern('dirty', 42, 0.2));
    store.setParam('bass', 'chaos', 0.9);
    expect(store.getState().bass.pattern).toEqual(generateBassPattern('dirty', 42, 0.9));
  });

  it('steps tonic and scale around, and flips wave and sub', () => {
    store.nudgeRoot(-1);
    expect(store.getState().key.root).toBe(11);
    store.nudgeRoot(1);
    store.nudgeRoot(1);
    expect(store.getState().key.root).toBe(1);
    store.nudgeScale(-1);
    expect(store.getState().key.scale).toBe('dorian');
    store.toggleBassWave();
    store.toggleBassSub();
    expect(store.getState().bass).toMatchObject({ wave: 'square', sub: true });
  });

  it('hand edits keep the generation', () => {
    store.toggleBassStep(BASS_ACCENT_ROW, 1);
    expect(store.getState().bass.pattern[1]?.accent).toBe(true);
    expect(store.getState().bass.generation).toBe(0);
  });
});

