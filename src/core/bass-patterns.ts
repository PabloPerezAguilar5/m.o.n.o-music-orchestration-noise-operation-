import { DEGREES } from './bass-scales';
import type { Pattern } from './patterns';
import { STEPS } from './patterns';
import { createRng, streamSeed } from './random';

/**
 * BASS patterns: 16 steps, each with an optional note (a scale degree), slide and
 * accent, like a TB-303 sequencer. Generation ported from fck-synth (bassPatterns.ts),
 * with slides and CAOS added.
 */

export interface BassStep {
  /** Scale degree 0 (tonic) … 4, or null for a rest. */
  readonly note: number | null;
  /** Glide into the next step's note without retriggering (legato). */
  readonly slide: boolean;
  readonly accent: boolean;
  /** Gate length in steps (DRONE holds notes over several steps). */
  readonly length: number;
}

export type BassPattern = readonly BassStep[];

export const BASS_MODES = ['pulse', 'broken', 'dirty', 'drone', 'chaos'] as const;
export type BassMode = (typeof BASS_MODES)[number];

/** Grid rows: the five degrees (highest on top), then slide and accent. */
export const BASS_SLIDE_ROW = DEGREES;
export const BASS_ACCENT_ROW = DEGREES + 1;
export const BASS_GRID_ROWS = DEGREES + 2;

const REST: BassStep = { note: null, slide: false, accent: false, length: 1 };

/** Grid row of a degree: the highest degree is the top row. */
export const rowOfDegree = (degree: number): number => DEGREES - 1 - degree;
export const degreeOfRow = (row: number): number => DEGREES - 1 - row;

/**
 * Starting pattern: the prototype's NOTA, SLD and ACC rows (notes on steps
 * 0 3 6 8 11 13, slides on 3 and 13, accents on 0 and 6), with a simple line.
 */
export const DEFAULT_BASS_PATTERN: BassPattern = (() => {
  const notes: Record<number, number> = { 0: 0, 3: 2, 6: 0, 8: 3, 11: 1, 13: 4 };
  return Array.from({ length: STEPS }, (_, step) => ({
    note: notes[step] ?? null,
    slide: step === 3 || step === 13,
    accent: step === 0 || step === 6,
    length: 1,
  }));
})();

/** On/off view for the step grid: five degree rows, SLD, ACC. */
export function gridFromBassPattern(pattern: BassPattern): Pattern {
  return Array.from({ length: BASS_GRID_ROWS }, (_, row) =>
    pattern.map((step) => {
      if (row === BASS_SLIDE_ROW) return step.slide;
      if (row === BASS_ACCENT_ROW) return step.accent;
      return step.note === degreeOfRow(row);
    }),
  );
}

/**
 * A tap on the grid. On a degree row it sets that note (tapping the same note
 * again makes a rest); on SLD and ACC it flips the flag.
 */
export function toggleBassCell(pattern: BassPattern, row: number, col: number): BassPattern {
  const step = pattern[col];
  if (!step || !Number.isInteger(row) || row < 0 || row >= BASS_GRID_ROWS) return pattern;
  let next: BassStep;
  if (row === BASS_SLIDE_ROW) next = { ...step, slide: !step.slide };
  else if (row === BASS_ACCENT_ROW) next = { ...step, accent: !step.accent };
  else {
    const degree = degreeOfRow(row);
    next = { ...step, note: step.note === degree ? null : degree, length: 1 };
  }
  return pattern.map((current, i) => (i === col ? next : current));
}

/** Whether two patterns light the same cells on the grid. */
export const sameBassGrid = (a: BassPattern, b: BassPattern): boolean =>
  a.length === b.length &&
  a.every(
    (step, i) => step.note === b[i]?.note && step.slide === b[i]?.slide && step.accent === b[i]?.accent,
  );

// Generation ------------------------------------------------------------------------------------

/** Per mode: accent and slide chances at CAOS 0. */
const MODE_FLAGS: Readonly<Record<BassMode, { accent: number; slide: number }>> = {
  pulse: { accent: 0.25, slide: 0.1 },
  broken: { accent: 0.25, slide: 0.15 },
  dirty: { accent: 0.6, slide: 0.3 },
  drone: { accent: 0.25, slide: 0.05 },
  chaos: { accent: 0.25, slide: 0.25 },
};

/**
 * A pattern from a mode, a seed and CAOS (0..1). The same three values always give
 * the same pattern. At CAOS 0 the notes follow fck-synth's rules; CAOS adds notes,
 * accents, slides and wider jumps.
 */
export function generateBassPattern(mode: BassMode, seed: number, chaos: number): BassPattern {
  const random = createRng(streamSeed(seed, `bass:${mode}`));
  const amount = Math.min(1, Math.max(0, Number.isFinite(chaos) ? chaos : 0));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  // fck-synth's rows count down from the highest degree; here 0 is the tonic.
  const degree = (fckRow: number): number => DEGREES - 1 - fckRow;
  const motif = [4, random() < 0.5 ? 2 : 1, 4, random() < 0.5 ? 3 : 0];
  const flags = MODE_FLAGS[mode];

  const steps = Array.from({ length: STEPS }, (_, step): BassStep => {
    let hit = false;
    let row = 4;
    let length = 1;
    switch (mode) {
      case 'pulse':
        hit = step % 2 === 0;
        row = motif[(step % 8) / 2] ?? 4;
        break;
      case 'broken':
        hit = step === 0 || random() < (step % 4 === 0 ? 0.55 : 0.27);
        row = pick([4, 4, 3, 2, 1]);
        break;
      case 'dirty':
        hit = step === 0 || random() < (step % 2 === 0 ? 0.85 : 0.48);
        row = pick([4, 4, 3, 2, 0]);
        break;
      case 'drone':
        hit = step === 0 || step === 8;
        row = step === 0 ? 4 : random() < 0.5 ? 4 : 1;
        length = 6;
        break;
      case 'chaos':
        hit = step === 0 || random() < 0.58;
        row = Math.floor(random() * 5);
        break;
    }
    // CAOS: extra notes on rests and wider jumps.
    if (!hit && random() < amount * 0.35) {
      hit = true;
      length = 1;
    }
    if (hit && random() < amount * 0.4) row = Math.floor(random() * 5);
    if (!hit) return REST;
    return {
      note: degree(row),
      accent: random() < Math.min(0.9, flags.accent + amount * 0.25),
      slide: random() < Math.min(0.8, flags.slide + amount * 0.35),
      length,
    };
  });
  return steps;
}

// Sequencing ------------------------------------------------------------------------------------

/** What the voice should do, at audio times. `id` ties a note-off to its note. */
export type BassEvent =
  | {
      readonly type: 'on';
      readonly time: number;
      readonly id: number;
      readonly midi: number;
      readonly accent: boolean;
      /** Glide from the sounding note without retriggering the envelopes. */
      readonly legato: boolean;
    }
  | { readonly type: 'off'; readonly time: number; readonly id: number };

/** How long a note's gate stays open, as a fraction of its length in steps. */
export const GATE_FRACTION = 0.55;

/**
 * Turns pattern steps into voice events, one step at a time, as the clock hands them
 * out. It remembers whether a note is being held by a slide, so the next note glides
 * in. A slide only holds when the next step has a note; otherwise the note is released
 * at the end of its step.
 */
export class BassSequencer {
  private nextId = 1;
  /** The note held into the next step by a slide, if any. */
  private held: number | null = null;

  /**
   * Events for one step. `midiOf` turns a degree into a MIDI note (key and scale).
   * `gate` scales the gate length (per mode).
   */
  step(
    pattern: BassPattern,
    index: number,
    time: number,
    duration: number,
    midiOf: (degree: number) => number,
    gate = 1,
  ): BassEvent[] {
    const step = pattern[index % STEPS] ?? REST;
    const events: BassEvent[] = [];
    if (step.note === null) {
      if (this.held !== null) events.push({ type: 'off', time, id: this.held });
      this.held = null;
      return events;
    }

    const legato = this.held !== null;
    const id = this.nextId++;
    events.push({ type: 'on', time, id, midi: midiOf(step.note), accent: step.accent, legato });

    const next = pattern[(index + 1) % STEPS] ?? REST;
    if (step.slide && next.note !== null) {
      this.held = id; // released by the next step
    } else {
      this.held = null;
      const length = step.slide ? 1 : Math.max(1, step.length) * GATE_FRACTION * gate;
      events.push({ type: 'off', time: time + length * duration, id });
    }
    return events;
  }

  /** Forgets any held note (stop, cable cut). The caller silences the voice. */
  reset(): void {
    this.held = null;
  }
}
