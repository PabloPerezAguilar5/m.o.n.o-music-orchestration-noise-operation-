import { beforeEach, describe, expect, it } from 'vitest';
import { Bass303, DEFAULT_BASS_PARAMS, polyBlep, softClip, type BassParams } from '../../src/audio/bass/bass-dsp';
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
import { bassMidi, degreeName, midiToHz, ROOTS, SCALE_IDS, SCALE_INTERVALS } from '../../src/core/bass-scales';
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
    expect(store.getState().bass).toMatchObject({
      root: 0,
      scale: 'pentaMinor',
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
    store.nudgeBassRoot(-1);
    expect(store.getState().bass.root).toBe(11);
    store.nudgeBassRoot(1);
    store.nudgeBassRoot(1);
    expect(store.getState().bass.root).toBe(1);
    store.nudgeBassScale(-1);
    expect(store.getState().bass.scale).toBe('dorian');
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

describe('303 voice (DSP)', () => {
  const RATE = 48000;
  const render = (voice: Bass303, seconds: number): Float32Array => {
    const out = new Float32Array(Math.round(seconds * RATE));
    for (let i = 0; i < out.length; i += 128) voice.render(out, i, Math.min(out.length, i + 128));
    return out;
  };
  const rms = (x: Float32Array) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length);
  const peak = (x: Float32Array) => x.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
  const voiceWith = (params: Partial<BassParams> = {}) => {
    const voice = new Bass303(RATE);
    voice.setParams({ ...DEFAULT_BASS_PARAMS, ...params });
    return voice;
  };

  it('PolyBLEP corrects only near a discontinuity', () => {
    const dt = 0.01;
    expect(polyBlep(0.5, dt)).toBe(0);
    expect(polyBlep(0, dt)).toBe(-1);
    expect(polyBlep(0.999999, dt)).toBeCloseTo(1, 3);
    expect(softClip(0)).toBe(0);
    expect(softClip(10)).toBe(1);
    expect(softClip(0.5)).toBeCloseTo(Math.tanh(0.5), 2);
  });

  it('is silent until a note, then sounds, bounded and finite', () => {
    const voice = voiceWith();
    expect(peak(render(voice, 0.05))).toBe(0);
    voice.noteOn(36, false, false);
    const out = render(voice, 0.3);
    expect(rms(out)).toBeGreaterThan(0.01);
    expect(peak(out)).toBeLessThan(1);
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it('stays bounded at full resonance and drive, saw and square, with sub', () => {
    for (const wave of [0, 1]) {
      const voice = voiceWith({ cutoff: 1, resonance: 1, drive: 1, sub: 1, wave, envMod: 1 });
      voice.noteOn(48, true, false);
      const out = render(voice, 0.5);
      expect(out.every(Number.isFinite)).toBe(true);
      expect(peak(out)).toBeLessThan(1);
    }
  });

  it('releases after note off', () => {
    const voice = voiceWith();
    voice.noteOn(36, false, false);
    render(voice, 0.2);
    voice.noteOff();
    render(voice, 0.1);
    expect(voice.sounding).toBe(false);
    expect(peak(render(voice, 0.05))).toBeLessThan(1e-3);
  });

  it('accent is louder and brighter', () => {
    const play = (accent: boolean) => {
      const voice = voiceWith({ cutoff: 0.3, resonance: 0.2, drive: 0 });
      voice.noteOn(36, accent, false);
      return render(voice, 0.08);
    };
    expect(rms(play(true))).toBeGreaterThan(rms(play(false)) * 1.2);
    expect(brightness(play(true))).toBeGreaterThan(brightness(play(false)));
  });

  it('slide glides the pitch over a few tens of ms; a normal note jumps', () => {
    const voice = voiceWith();
    voice.noteOn(36, false, false);
    render(voice, 0.05);
    voice.noteOn(48, false, true);
    render(voice, 0.01);
    const midway = voice.frequency;
    expect(midway).toBeGreaterThan(midiToHz(36) * 1.05);
    expect(midway).toBeLessThan(midiToHz(48) * 0.95);
    render(voice, 0.2);
    expect(voice.frequency).toBeCloseTo(midiToHz(48), 0);

    const jump = voiceWith();
    jump.noteOn(36, false, false);
    render(jump, 0.05);
    jump.noteOn(48, false, false);
    expect(jump.frequency).toBeCloseTo(midiToHz(48), 6);
  });

  /** High-frequency share of a signal: energy of its slope over its energy. */
  const brightness = (x: Float32Array) => {
    const slope = x.subarray(1).map((v, i) => v - x[i]!);
    return rms(slope) / rms(x);
  };

  it('legato keeps the envelopes; a retrigger reopens the filter', () => {
    const after = (legato: boolean) => {
      const voice = voiceWith({ cutoff: 0.2, resonance: 0, envMod: 1, decay: 0.1 });
      voice.noteOn(36, false, false);
      render(voice, 0.4); // the filter envelope has closed
      voice.noteOn(36, false, legato);
      return brightness(render(voice, 0.03));
    };
    expect(after(false)).toBeGreaterThan(after(true) * 1.5);
  });

  it('parameter jumps are smoothed: no sample-to-sample step bigger than the signal allows', () => {
    const voice = voiceWith({ cutoff: 0.1, drive: 0 });
    voice.noteOn(36, false, false);
    render(voice, 0.1);
    const before = render(voice, 0.002);
    voice.setParams({ ...DEFAULT_BASS_PARAMS, cutoff: 1, drive: 1, wave: 1, sub: 1 });
    const after = render(voice, 0.004);
    const first = after[0]! - before[before.length - 1]!;
    expect(Math.abs(first)).toBeLessThan(0.05);
  });
});
