import { beforeEach, describe, expect, it } from 'vitest';
import { STEPS } from '../../src/core/patterns';
import { SCALE_IDS, SCALE_INTERVALS, SYNTH_STEPS, synthMidi } from '../../src/core/scales';
import {
  DEFAULT_SYNTH_PATTERN,
  generateSynthPattern,
  gridFromSynthPattern,
  rowOfNote,
  SYNTH_DUR_ROW,
  SYNTH_GATE,
  SYNTH_LENGTHS,
  SYNTH_MAX_NOTES,
  SYNTH_MODES,
  synthDimmedCells,
  synthDurLabels,
  SynthSequencer,
  toggleSynthCell,
  type SynthPattern,
  type SynthStep,
} from '../../src/core/synth-patterns';
import { Store } from '../../src/state/store';

const rest: SynthStep = { notes: [], length: 1 };
const patternOf = (steps: Record<number, Partial<SynthStep>>): SynthPattern =>
  Array.from({ length: STEPS }, (_, i) => ({ ...rest, ...steps[i] }));

describe('SYNTH key: two octaves quantized to the shared scale', () => {
  it('spans two octaves from C3, every note in the scale', () => {
    expect(synthMidi(0, 'pentaMinor', 0)).toBe(48); // C3
    expect(synthMidi(0, 'pentaMinor', 5)).toBe(60); // C4, an octave up
    expect(synthMidi(0, 'pentaMinor', 9)).toBe(70); // Bb4
    expect(synthMidi(0, 'pentaMinor', 12)).toBe(70); // clamped to the range
    for (const scale of SCALE_IDS) {
      for (const root of [0, 5, 11]) {
        for (let n = 0; n < SYNTH_STEPS; n++) {
          const interval = (((synthMidi(root, scale, n) - 48 - root) % 12) + 12) % 12;
          expect(SCALE_INTERVALS[scale]).toContain(interval);
        }
      }
    }
  });
});

describe('SYNTH patterns', () => {
  it('starts from the prototype NOTA steps, with chords', () => {
    const playing = DEFAULT_SYNTH_PATTERN.flatMap((s, i) => (s.notes.length ? [i] : []));
    expect(playing).toEqual([0, 2, 5, 7, 10, 12, 15]);
    expect(DEFAULT_SYNTH_PATTERN[0]?.notes).toHaveLength(3);
  });

  it('shows ten note rows (highest on top) and DUR, with the length written on it', () => {
    const pattern = patternOf({ 3: { notes: [0, 4, 9], length: 4 }, 6: { notes: [2] } });
    const grid = gridFromSynthPattern(pattern);
    expect(grid).toHaveLength(11);
    expect(grid[rowOfNote(9)]?.[3]).toBe(true);
    expect(grid[0]?.[3]).toBe(true); // note 9 is the top row
    expect(grid[9]?.[3]).toBe(true); // note 0 is the bottom note row
    expect(grid[SYNTH_DUR_ROW]?.[3]).toBe(true); // held 4 steps
    expect(grid[SYNTH_DUR_ROW]?.[6]).toBe(false); // a single step
    const labels = synthDurLabels(pattern);
    expect(labels[3]).toBe('4');
    expect(labels[6]).toBe('1');
    expect(labels[0]).toBe('');
  });

  describe('chords: up to three notes per step', () => {
    it('adds notes in order and removes them on a second tap', () => {
      let p = patternOf({});
      p = toggleSynthCell(p, rowOfNote(4), 0);
      p = toggleSynthCell(p, rowOfNote(0), 0);
      p = toggleSynthCell(p, rowOfNote(7), 0);
      expect(p[0]?.notes).toEqual([0, 4, 7]);
      p = toggleSynthCell(p, rowOfNote(4), 0);
      expect(p[0]?.notes).toEqual([0, 7]);
    });

    it('a fourth note replaces the closest one: never more than three', () => {
      let p = patternOf({ 0: { notes: [0, 4, 8] } });
      p = toggleSynthCell(p, rowOfNote(5), 0);
      expect(p[0]?.notes).toEqual([0, 5, 8]);
      expect(p[0]?.notes.length).toBeLessThanOrEqual(SYNTH_MAX_NOTES);
    });
  });

  it('dims DURACIÓN on steps without notes; note rows never dim', () => {
    const dimmed = synthDimmedCells(patternOf({ 4: { notes: [2] } }));
    expect(dimmed[SYNTH_DUR_ROW]?.[4]).toBe(false);
    expect(dimmed[SYNTH_DUR_ROW]?.filter(Boolean)).toHaveLength(15);
    expect(dimmed.slice(0, SYNTH_DUR_ROW).flat().some(Boolean)).toBe(false);
  });

  it('DUR cycles 1, 2, 4, 8, 16 and back; bad coordinates change nothing', () => {
    let p = patternOf({ 2: { notes: [3] } });
    const seen: number[] = [];
    for (let i = 0; i < SYNTH_LENGTHS.length; i++) {
      p = toggleSynthCell(p, SYNTH_DUR_ROW, 2);
      seen.push(p[2]!.length);
    }
    expect(seen).toEqual([2, 4, 8, 16, 1]);
    expect(toggleSynthCell(p, 11, 0)).toBe(p);
    expect(toggleSynthCell(p, 0, 16)).toBe(p);
  });

  it.each(SYNTH_MODES)('%s is reproducible per seed and stays in range', (mode) => {
    const a = generateSynthPattern(mode, 1234, 0.3);
    expect(generateSynthPattern(mode, 1234, 0.3)).toEqual(a);
    expect(a).toHaveLength(STEPS);
    expect(a.some((s) => s.notes.length > 0)).toBe(true);
    for (const step of a) {
      expect(step.notes.length).toBeLessThanOrEqual(SYNTH_MAX_NOTES);
      expect([...step.notes].sort((x, y) => x - y)).toEqual(step.notes);
      for (const note of step.notes) {
        expect(note).toBeGreaterThanOrEqual(0);
        expect(note).toBeLessThan(SYNTH_STEPS);
      }
      expect(step.length).toBeGreaterThanOrEqual(1);
      expect(step.length).toBeLessThanOrEqual(16);
    }
    const others = new Set([1, 2, 3, 4, 5].map((s) => JSON.stringify(generateSynthPattern(mode, s * 977, 0.3))));
    expect(others.size).toBeGreaterThan(1);
  });

  it('each mode has its character', () => {
    const stats = (mode: (typeof SYNTH_MODES)[number]) => {
      let notes = 0;
      let hits = 0;
      let length = 0;
      for (let seed = 1; seed <= 40; seed++) {
        for (const step of generateSynthPattern(mode, seed, 0)) {
          if (step.notes.length === 0) continue;
          hits++;
          notes += step.notes.length;
          length += step.length;
        }
      }
      return { perHit: notes / hits, hitsPerBar: hits / 40, length: length / hits };
    };
    const arp = stats('arp');
    const chords = stats('chords');
    const melody = stats('melody');
    const ambient = stats('ambient');
    expect(arp.perHit).toBe(1); // one note at a time
    expect(chords.perHit).toBeGreaterThan(2.5); // chords
    expect(arp.hitsPerBar).toBeGreaterThan(chords.hitsPerBar);
    expect(ambient.length).toBeGreaterThan(6); // long held chords
    expect(ambient.hitsPerBar).toBeLessThan(3);
    expect(melody.perHit).toBeLessThan(1.2);
  });

  it('CAOS adds notes (average over seeds)', () => {
    const count = (chaos: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        n += generateSynthPattern('melody', seed, chaos).filter((s) => s.notes.length > 0).length;
      }
      return n;
    };
    expect(count(1)).toBeGreaterThan(count(0));
  });
});

describe('SYNTH sequence: polyphony and duration', () => {
  const midiOf = (n: number) => synthMidi(0, 'pentaMinor', n);

  it('a chord starts all its notes together and releases them after its length', () => {
    const sequencer = new SynthSequencer();
    const events = sequencer.step(patternOf({ 0: { notes: [0, 2, 4], length: 4 } }), 0, 1, 0.125, midiOf);
    const ons = events.filter((e) => e.type === 'on');
    const offs = events.filter((e) => e.type === 'off');
    expect(ons.map((e) => e.type === 'on' && e.midi)).toEqual([48, 53, 58]);
    expect(ons.every((e) => e.time === 1)).toBe(true);
    expect(offs.every((e) => e.time === 1 + 4 * 0.125 * SYNTH_GATE)).toBe(true);
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
  });

  it('long notes overlap the next steps (the engine holds up to four voices)', () => {
    const sequencer = new SynthSequencer();
    const pattern = patternOf({ 0: { notes: [0, 4], length: 8 }, 2: { notes: [7], length: 1 } });
    const events = [0, 1, 2].flatMap((i) => sequencer.step(pattern, i, i * 0.125, 0.125, midiOf));
    const sounding = (t: number) =>
      events.filter((e) => e.type === 'on' && e.time <= t).filter((on) => {
        const off = events.find((e) => e.type === 'off' && e.id === on.id);
        return !off || off.time > t;
      }).length;
    expect(sounding(0.3)).toBe(3);
  });

  it('rests produce no events', () => {
    expect(new SynthSequencer().step(patternOf({}), 3, 0, 0.125, midiOf)).toEqual([]);
  });
});

describe('SYNTH in the store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store();
  });

  it('starts with PLUCK, the prototype steps and the shared key', () => {
    expect(store.getState().synth).toMatchObject({ preset: 'pluck', generation: 0, pattern: DEFAULT_SYNTH_PATTERN });
  });

  it('DICE: a new pattern each press in the current mode', () => {
    let seed = 0;
    for (let press = 0; press < 15; press++) {
      const before = store.getState().synth;
      store.randomizeSynth(() => (seed += 7919));
      const after = store.getState().synth;
      expect(after.generation).toBe(before.generation + 1);
      expect(gridFromSynthPattern(after.pattern)).not.toEqual(gridFromSynthPattern(before.pattern));
      expect(after.pattern).toEqual(generateSynthPattern(after.mode, after.seed, 0.2));
    }
  });

  it('a mode regenerates from the same seed; CAOS too; a preset keeps the pattern', () => {
    store.randomizeSynth(() => 42);
    store.setSynthMode('arp');
    expect(store.getState().synth.pattern).toEqual(generateSynthPattern('arp', 42, 0.2));
    store.setParam('synth', 'chaos', 0.8);
    expect(store.getState().synth.pattern).toEqual(generateSynthPattern('arp', 42, 0.8));
    const pattern = store.getState().synth.pattern;
    store.setSynthPreset('pad');
    expect(store.getState().synth).toMatchObject({ preset: 'pad', pattern });
  });

  it('hand edits keep the generation', () => {
    store.toggleSynthStep(SYNTH_DUR_ROW, 0);
    expect(store.getState().synth.pattern[0]?.length).toBe(4);
    expect(store.getState().synth.generation).toBe(0);
  });
});
