import { beforeEach, describe, expect, it } from 'vitest';
import { STEPS } from '../../src/core/patterns';
import { SCALE_IDS, SCALE_INTERVALS, SYNTH_STEPS, synthMidi } from '../../src/core/scales';
import {
  DEFAULT_SYNTH_PATTERN,
  generateSynthPattern,
  sameSynthGrid,
  setSynthLength,
  SYNTH_GATE,
  SYNTH_MAX_NOTES,
  SYNTH_MODES,
  SYNTH_PANEL_LENGTHS,
  SynthSequencer,
  toggleSynthNote,
  type SynthPattern,
  type SynthStep,
} from '../../src/core/synth-patterns';
import { parsePatchText, patchJson } from '../../src/core/patch';
import { patchFromState } from '../../src/state/patch-state';
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

  describe('chords: up to three notes per step', () => {
    /** Taps the keys in order, keeping the age the store keeps. */
    const tap = (p: SynthPattern, notes: number[], step = 0, age: readonly number[] = []) => {
      let result = { pattern: p, age };
      for (const note of notes) result = toggleSynthNote(result.pattern, step, note, result.age);
      return result;
    };

    it('adds notes (kept sorted) and removes a lit one on a second tap', () => {
      let r = tap(patternOf({}), [4, 0, 7]);
      expect(r.pattern[0]?.notes).toEqual([0, 4, 7]);
      r = tap(r.pattern, [4], 0, r.age);
      expect(r.pattern[0]?.notes).toEqual([0, 7]);
    });

    it('a fourth note replaces the OLDEST one, not the closest or the lowest', () => {
      // Added 7, then 0, then 4: the oldest is 7 (the highest), so 7 goes.
      const r = tap(patternOf({}), [7, 0, 4, 2]);
      expect(r.pattern[0]?.notes).toEqual([0, 2, 4]);
      // Then 9 takes the place of 0 (the oldest now), and 5 the place of 4.
      const s = tap(r.pattern, [9, 5], 0, r.age);
      expect(s.pattern[0]?.notes).toEqual([2, 5, 9]);
      expect(s.pattern[0]?.notes.length).toBeLessThanOrEqual(SYNTH_MAX_NOTES);
    });

    it('a note taken out and added again becomes the newest', () => {
      let r = tap(patternOf({}), [1, 2, 3]);
      r = tap(r.pattern, [1, 1], 0, r.age); // out, then in again: now the order is 2, 3, 1
      r = tap(r.pattern, [8], 0, r.age); // replaces 2
      expect(r.pattern[0]?.notes).toEqual([1, 3, 8]);
    });

    it('a step whose notes the panel never saw (generated, loaded) loses its lowest note first', () => {
      const r = toggleSynthNote(patternOf({ 0: { notes: [1, 4, 6] } }), 0, 9);
      expect(r.pattern[0]?.notes).toEqual([4, 6, 9]);
    });

    it('edits one step only, keeps its length, and bad taps change nothing', () => {
      const p = patternOf({ 3: { notes: [2], length: 4 } });
      const r = toggleSynthNote(p, 3, 5);
      expect(r.pattern[3]).toEqual({ notes: [2, 5], length: 4 });
      expect(r.pattern.filter((_, i) => i !== 3)).toEqual(p.filter((_, i) => i !== 3));
      expect(toggleSynthNote(p, 16, 0).pattern).toBe(p);
      expect(toggleSynthNote(p, 0, SYNTH_STEPS).pattern).toBe(p);
      expect(toggleSynthNote(p, 0, -1).pattern).toBe(p);
    });
  });

  it('LARGO sets the length of a step: 1 to 4 from the panel, and 8 and 16 stay valid', () => {
    let p = patternOf({ 2: { notes: [3] } });
    for (const length of SYNTH_PANEL_LENGTHS) {
      p = setSynthLength(p, 2, length);
      expect(p[2]?.length).toBe(length);
    }
    expect(setSynthLength(p, 2, 4)).toBe(p); // already 4
    expect(setSynthLength(p, 2, 5)).toBe(p); // there is no 5
    expect(setSynthLength(p, 16, 2)).toBe(p); // there is no step 17
    expect(setSynthLength(p, 2, 16)[2]?.length).toBe(16);
    expect(p[2]?.notes).toEqual([3]);
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
      expect(sameSynthGrid(after.pattern, before.pattern)).toBe(false);
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

  it('hand edits (a key, LARGO) keep the generation', () => {
    store.setSynthLength(0, 3);
    expect(store.getState().synth.pattern[0]?.length).toBe(3);
    store.toggleSynthNote(1, 6);
    expect(store.getState().synth.pattern[1]?.notes).toEqual([6]);
    expect(store.getState().synth.generation).toBe(0);
  });

  it('a fourth key replaces the oldest note, as the panel sees it', () => {
    store.clearPattern('synth');
    for (const note of [5, 1, 8]) store.toggleSynthNote(2, note);
    store.toggleSynthNote(2, 3);
    expect(store.getState().synth.pattern[2]?.notes).toEqual([1, 3, 8]); // 5 went: it was the first
    store.toggleSynthNote(2, 8); // out
    expect(store.getState().synth.pattern[2]?.notes).toEqual([1, 3]);
  });

  it('BORRAR and DICE forget the order of old taps', () => {
    store.clearPattern('synth');
    for (const note of [9, 0, 4]) store.toggleSynthNote(0, note);
    store.clearPattern('synth');
    for (const note of [0, 4, 9]) store.toggleSynthNote(0, note);
    store.toggleSynthNote(0, 2);
    expect(store.getState().synth.pattern[0]?.notes).toEqual([2, 4, 9]); // 0 was the oldest now
  });

  it('a patch keeps a step with a chord and a length of 3', () => {
    store.toggleSynthNote(4, 2);
    store.toggleSynthNote(4, 7);
    store.setSynthLength(4, 3);
    const patch = patchFromState(store.getState(), 'x', '');
    const copy = new Store();
    copy.loadPatch(parsePatchText(patchJson(patch)).patch);
    expect(copy.getState().synth.pattern[4]).toEqual({ notes: [2, 7], length: 3 });
  });
});
