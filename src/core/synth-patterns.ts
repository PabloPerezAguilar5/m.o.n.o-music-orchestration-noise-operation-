import type { Pattern } from './patterns';
import { STEPS } from './patterns';
import { createRng, streamSeed, type RandomSource } from './random';
import { DEGREES, SYNTH_STEPS } from './scales';
import type { VoiceEvent } from './voice-events';

/**
 * SYNTH patterns: 16 steps, each with up to three notes (a chord) and a length in
 * steps. Notes are scale steps over two octaves (0 … 9), so every note is in the key
 * shared with BASS.
 */

export interface SynthStep {
  /** Scale steps 0 … 9, ascending, at most SYNTH_MAX_NOTES. Empty = rest. */
  readonly notes: readonly number[];
  /** How many steps the notes are held. */
  readonly length: number;
}

export type SynthPattern = readonly SynthStep[];

export const SYNTH_MAX_NOTES = 3;
/** Lengths the DUR row cycles through, in steps. */
export const SYNTH_LENGTHS = [1, 2, 4, 8, 16] as const;

export const SYNTH_MODES = ['arp', 'chords', 'melody', 'ambient'] as const;
export type SynthMode = (typeof SYNTH_MODES)[number];

/** Grid rows: the ten notes (highest on top), then DUR. */
export const SYNTH_DUR_ROW = SYNTH_STEPS;
export const SYNTH_GRID_ROWS = SYNTH_STEPS + 1;

export const rowOfNote = (note: number): number => SYNTH_STEPS - 1 - note;
export const noteOfRow = (row: number): number => SYNTH_STEPS - 1 - row;

const REST: SynthStep = { notes: [], length: 1 };

/** A SYNTH pattern of rests (BORRAR). */
export const EMPTY_SYNTH_PATTERN: SynthPattern = Array.from({ length: STEPS }, () => REST);

/** Clamps, dedupes, sorts and caps a chord. */
const chord = (notes: readonly number[]): number[] =>
  [...new Set(notes.map((n) => Math.min(SYNTH_STEPS - 1, Math.max(0, Math.round(n)))))]
    .sort((a, b) => a - b)
    .slice(0, SYNTH_MAX_NOTES);

/** Starting pattern: the prototype's NOTA steps (1 3 6 8 11 13 16), a little rising line. */
export const DEFAULT_SYNTH_PATTERN: SynthPattern = (() => {
  const notes: Record<number, number[]> = {
    0: [0, 2, 4],
    2: [4],
    5: [5],
    7: [7],
    10: [1, 3, 5],
    12: [6],
    15: [4],
  };
  return Array.from({ length: STEPS }, (_, step) => ({ notes: notes[step] ?? [], length: step === 0 || step === 10 ? 2 : 1 }));
})();

/** On/off view for the step grid: ten note rows, then DUR (lit when a note is held more than a step). */
export function gridFromSynthPattern(pattern: SynthPattern): Pattern {
  return Array.from({ length: SYNTH_GRID_ROWS }, (_, row) =>
    pattern.map((step) =>
      row === SYNTH_DUR_ROW ? step.notes.length > 0 && step.length > 1 : step.notes.includes(noteOfRow(row)),
    ),
  );
}

/** Cells shown dimmed on the grid: the length row on steps without notes (it does nothing there). */
export function synthDimmedCells(pattern: SynthPattern): Pattern {
  return Array.from({ length: SYNTH_GRID_ROWS }, (_, row) =>
    pattern.map((step) => row === SYNTH_DUR_ROW && step.notes.length === 0),
  );
}

/** Text inside the DUR keys: the length of every step that plays. */
export function synthDurLabels(pattern: SynthPattern): string[] {
  return pattern.map((step) => (step.notes.length > 0 ? String(step.length) : ''));
}

/**
 * A tap on the grid. On a note row: adds that note to the step's chord, or removes it.
 * A fourth note replaces the closest one in the chord (moving that chord tone). On DUR:
 * the next length (1, 2, 4, 8, 16, back to 1).
 */
export function toggleSynthCell(pattern: SynthPattern, row: number, col: number): SynthPattern {
  const step = pattern[col];
  if (!step || !Number.isInteger(row) || row < 0 || row >= SYNTH_GRID_ROWS) return pattern;
  let next: SynthStep;
  if (row === SYNTH_DUR_ROW) {
    const index = SYNTH_LENGTHS.indexOf(step.length as (typeof SYNTH_LENGTHS)[number]);
    next = { ...step, length: SYNTH_LENGTHS[(index + 1) % SYNTH_LENGTHS.length]! };
  } else {
    const note = noteOfRow(row);
    if (step.notes.includes(note)) {
      next = { ...step, notes: step.notes.filter((n) => n !== note) };
    } else if (step.notes.length < SYNTH_MAX_NOTES) {
      next = { ...step, notes: chord([...step.notes, note]) };
    } else {
      const closest = step.notes.reduce((best, n) => (Math.abs(n - note) < Math.abs(best - note) ? n : best));
      next = { ...step, notes: chord([...step.notes.filter((n) => n !== closest), note]) };
    }
  }
  return pattern.map((current, i) => (i === col ? next : current));
}

/** Whether two patterns look the same on the grid (notes and lengths). */
export const sameSynthGrid = (a: SynthPattern, b: SynthPattern): boolean =>
  a.length === b.length &&
  a.every((step, i) => {
    const other = b[i];
    return (
      !!other &&
      step.notes.length === other.notes.length &&
      step.notes.every((n, j) => n === other.notes[j]) &&
      (step.notes.length === 0 || step.length === other.length)
    );
  });

// Generation ------------------------------------------------------------------------------------

/** A triad-like chord on a scale step: every other note of the five-note scale. */
const triad = (rootStep: number, size = 3): number[] =>
  chord([rootStep, rootStep + 2, rootStep + 4].slice(0, size));

/** Chord roots that sound like a progression in a five-note scale. */
const PROGRESSIONS: readonly (readonly number[])[] = [
  [0, 3, 4, 2],
  [0, 2, 3, 1],
  [0, 4, 3, 3],
  [1, 0, 3, 4],
];

const pickOf =
  (random: RandomSource) =>
  <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)]!;

type Generator = (random: RandomSource, chaos: number) => SynthStep[];

const GENERATORS: Readonly<Record<SynthMode, Generator>> = {
  /** One chord broken into a running line, up, down or both. */
  arp: (random, chaos) => {
    const pick = pickOf(random);
    const progression = pick(PROGRESSIONS);
    const rate = random() < 0.5 ? 1 : 2; // every step or every other step
    const shape = pick(['up', 'down', 'updown'] as const);
    const steps: SynthStep[] = [];
    let tone = 0;
    for (let step = 0; step < STEPS; step++) {
      // First half on the first chord, second half on the third: the triad plus its octave.
      const base = progression[step < 8 ? 0 : 2]!;
      const tones = [...triad(base), base + DEGREES];
      if (step % rate !== 0 || random() < chaos * 0.25) {
        steps.push(REST);
        continue;
      }
      const index =
        shape === 'up'
          ? tone % tones.length
          : shape === 'down'
            ? tones.length - 1 - (tone % tones.length)
            : [0, 1, 2, 3, 2, 1][tone % 6]!;
      tone++;
      let note = tones[index] ?? 0;
      if (random() < chaos * 0.3) note += pick([-2, -1, 1, 2]);
      steps.push({ notes: chord([note + (step >= 8 && random() < chaos * 0.4 ? DEGREES : 0)]), length: 1 });
    }
    return steps;
  },

  /** Chord hits on a rhythm, following a progression. */
  chords: (random, chaos) => {
    const pick = pickOf(random);
    const progression = pick(PROGRESSIONS);
    const rhythm = pick([
      [0, 8],
      [0, 6, 8, 14],
      [0, 3, 6, 10, 12],
      [0, 4, 8, 12],
    ]);
    const hits = new Set(rhythm);
    for (let step = 1; step < STEPS; step++) if (random() < chaos * 0.2) hits.add(step);
    return Array.from({ length: STEPS }, (_, step): SynthStep => {
      if (!hits.has(step)) return REST;
      const rootStep = progression[Math.floor((step / STEPS) * progression.length)]!;
      // An inversion now and then: the root an octave up.
      const notes = triad(rootStep).map((n, i) => (i === 0 && random() < 0.3 + chaos * 0.3 ? n + DEGREES : n));
      // Held a little when the next hit is far, short stabs when it is close.
      const gap = (rhythm.find((r) => r > step) ?? STEPS) - step;
      return { notes: chord(notes), length: gap >= 3 ? 2 : 1 };
    });
  },

  /** A single line moving mostly by step, with rests and held notes. */
  melody: (random, chaos) => {
    const pick = pickOf(random);
    let note = 3 + Math.floor(random() * 4);
    const steps: SynthStep[] = [];
    let hold = 0;
    for (let step = 0; step < STEPS; step++) {
      if (hold > 0) {
        hold--;
        steps.push(REST);
        continue;
      }
      const chance = step === 0 ? 1 : step % 2 === 0 ? 0.65 + chaos * 0.2 : 0.3 + chaos * 0.4;
      if (random() >= chance) {
        steps.push(REST);
        continue;
      }
      const leap = random() < 0.2 + chaos * 0.5 ? pick([-4, -3, 3, 4]) : pick([-2, -1, -1, 1, 1, 2]);
      note = Math.min(SYNTH_STEPS - 1, Math.max(0, note + leap));
      const length = random() < 0.3 ? 2 : 1;
      hold = length - 1;
      const dyad = random() < chaos * 0.3 ? [note, Math.max(0, note - 2)] : [note];
      steps.push({ notes: chord(dyad), length });
    }
    return steps;
  },

  /** Few long, open chords. */
  ambient: (random, chaos) => {
    const pick = pickOf(random);
    const progression = pick(PROGRESSIONS);
    const starts = random() < 0.5 ? [0] : [0, 8];
    if (random() < chaos * 0.6) starts.push(pick([4, 12]));
    starts.sort((a, b) => a - b);
    return Array.from({ length: STEPS }, (_, step): SynthStep => {
      const at = starts.indexOf(step);
      if (at < 0) return REST;
      const rootStep = progression[at % progression.length]!;
      // Open voicing: root, fifth-ish and the next octave.
      const notes = [rootStep, rootStep + 3, rootStep + DEGREES + (random() < 0.5 ? 1 : 2)];
      const next = starts[at + 1] ?? STEPS;
      return { notes: chord(notes), length: Math.min(16, next - step) };
    });
  },
};

/**
 * A pattern from a mode, a seed and CAOS (0..1). The same three values always give
 * the same pattern; CAOS adds notes, leaps and rests.
 */
export function generateSynthPattern(mode: SynthMode, seed: number, chaos: number): SynthPattern {
  const random = createRng(streamSeed(seed, `synth:${mode}`));
  const amount = Math.min(1, Math.max(0, Number.isFinite(chaos) ? chaos : 0));
  return GENERATORS[mode](random, amount);
}

// Sequencing ------------------------------------------------------------------------------------

/** Notes are released just before the end of their length, so repeated chords re-attack. */
export const SYNTH_GATE = 0.9;

/**
 * Turns pattern steps into voice events: every note of a step's chord starts at the
 * step and is released after its length. The engine plays up to four at once and
 * steals the oldest voice when more overlap.
 */
export class SynthSequencer {
  private nextId = 1;

  step(
    pattern: SynthPattern,
    index: number,
    time: number,
    duration: number,
    midiOf: (note: number) => number,
  ): VoiceEvent[] {
    const step = pattern[index % STEPS] ?? REST;
    const release = time + Math.max(1, step.length) * duration * SYNTH_GATE;
    return step.notes.flatMap((note): VoiceEvent[] => {
      const id = this.nextId++;
      return [
        { type: 'on', time, id, midi: midiOf(note), accent: false, legato: false },
        { type: 'off', time: release, id },
      ];
    });
  }

  reset(): void {
    // Nothing is held across steps: every note carries its own release.
  }
}
