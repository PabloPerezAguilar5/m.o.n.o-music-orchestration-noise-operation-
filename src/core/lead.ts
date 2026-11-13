import { clamp01 } from './geometry';
import type { RandomSource } from './random';
import { SCALE_INTERVALS, type ScaleId } from './scales';

/**
 * LEAD, the live keyboard: which note each key plays (octave, SCALE LOCK), the
 * fingers held down (a mono voice played with several fingers) and the knob mappings.
 * Pure TypeScript: the UI feeds it touches, the audio receives the note events.
 */

/** Two octaves from C plus the top C: 15 white keys, 25 notes. */
export const LEAD_WHITE_KEYS = 15;
export const LEAD_KEY_COUNT = 25;
/** MIDI note of the keyboard's first key at OCT 0 (C4). */
export const LEAD_BASE_MIDI = 60;
/** OCT − and + range: from C1 … C3 up to C6 … C8. */
export const LEAD_OCTAVE_MIN = -3;
export const LEAD_OCTAVE_MAX = 2;

export const clampLeadOctave = (octave: number): number =>
  Math.min(LEAD_OCTAVE_MAX, Math.max(LEAD_OCTAVE_MIN, Math.round(octave)));

/** Whether a MIDI note belongs to the key (tonic 0..11 and its five-note scale). */
export function inScale(midi: number, root: number, scale: ScaleId): boolean {
  const pitchClass = (((Math.round(midi) - Math.round(root)) % 12) + 12) % 12;
  return SCALE_INTERVALS[scale].includes(pitchClass);
}

/** SCALE LOCK: the nearest note of the key. A note halfway between two goes down. */
export function lockToScale(midi: number, root: number, scale: ScaleId): number {
  const note = Math.round(midi);
  let best = note;
  let bestDistance = Infinity;
  // Scanning upwards, the lower of two equally near notes is found first and kept.
  for (let candidate = note - 6; candidate <= note + 6; candidate++) {
    const distance = Math.abs(candidate - note);
    if (distance < bestDistance && inScale(candidate, root, scale)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** MIDI note of a key (semitones above the keyboard's first C) at an octave, locked or not. */
export function leadMidi(semitone: number, octave: number, root: number, scale: ScaleId, locked: boolean): number {
  const midi = LEAD_BASE_MIDI + clampLeadOctave(octave) * 12 + Math.round(semitone);
  return locked ? lockToScale(midi, root, scale) : midi;
}

/** Note name of the first key at an octave, e.g. "C4". */
export const leadOctaveName = (octave: number): string => `C${4 + clampLeadOctave(octave)}`;

/** The keyboard's range at an octave, first key to last, e.g. "C4-C6". */
export const leadRangeName = (octave: number): string => {
  const first = 4 + clampLeadOctave(octave);
  return `C${first}-C${first + 2}`;
};

// Knobs ------------------------------------------------------------------------------------------

/** ATAQUE: 2 ms … ~2 s (linear attack time, exponential knob). */
export const leadAttackTime = (knob: number): number => 0.002 * 2 ** (clamp01(knob) * 10);
/** RELEASE: 10 ms … ~2.5 s (time constant, exponential knob). */
export const leadReleaseTime = (knob: number): number => 0.01 * 2 ** (clamp01(knob) * 8);
/**
 * GLIDE: portamento time constant. Off at the bottom of the knob (notes jump; two
 * fingers still change note without retriggering), then 8 ms … ~1 s.
 */
export const leadGlideTime = (knob: number): number => {
  const k = clamp01(knob);
  return k < 0.02 ? 0 : 0.008 * 2 ** (k * 7);
};

// CAOS -------------------------------------------------------------------------------------------

/** What CAOS does to one note: a random accent, an octave jump, a slight detune. */
export interface LeadVariation {
  /** Semitones added (fractional with a detune). */
  readonly offset: number;
  readonly accent: boolean;
}

/**
 * CAOS on LEAD: each note may come accented (up to one in two at full), jump an
 * octave (above half the knob, up to one in five) and, without SCALE LOCK, come up
 * to a third of a semitone off. At 0 the keyboard plays exactly what is pressed.
 */
export function leadVariation(random: RandomSource, chaos: number, locked: boolean): LeadVariation {
  const c = clamp01(chaos);
  const accent = random() < c * 0.5;
  const jump = random() < Math.max(0, c - 0.5) * 0.4 ? (random() < 0.5 ? -12 : 12) : 0;
  const detune = locked || c === 0 ? 0 : (random() * 2 - 1) * c * 0.33;
  return { offset: jump + detune, accent };
}

// Fingers ----------------------------------------------------------------------------------------

/** What the keyboard asks of the mono LEAD voice. */
export type LeadNoteEvent =
  | {
      readonly type: 'on';
      readonly id: number;
      readonly midi: number;
      readonly accent: boolean;
      /** Change note without retriggering: another finger is still down. */
      readonly legato: boolean;
    }
  | { readonly type: 'off'; readonly id: number };

interface Held {
  readonly touch: number;
  midi: number;
  accent: boolean;
}

/**
 * Multitouch on a mono voice: every finger down is remembered, the last one pressed
 * sounds. Pressing another key glides to it (legato); lifting the sounding finger
 * goes back to the previous one still down; lifting the last one releases the note.
 * Each note-on has its own id, so a note-off never cuts a newer note.
 */
export class LeadNotes {
  /** Fingers down, oldest first; the last one is sounding. */
  private held: Held[] = [];
  private nextId = 1;
  private sounding: number | null = null;

  /** Number of fingers down. */
  get fingers(): number {
    return this.held.length;
  }

  /** Whether a note is on (its gate open). */
  get playing(): boolean {
    return this.sounding !== null;
  }

  /** A finger goes down on a note. */
  press(touch: number, midi: number, accent = false): LeadNoteEvent[] {
    this.held = this.held.filter((finger) => finger.touch !== touch);
    this.held.push({ touch, midi, accent });
    return [this.on(midi, accent, this.sounding !== null)];
  }

  /** A finger slides onto another note: the sounding one glides there. */
  move(touch: number, midi: number): LeadNoteEvent[] {
    const index = this.held.findIndex((finger) => finger.touch === touch);
    if (index < 0) return [];
    const finger = this.held[index]!;
    if (finger.midi === midi) return [];
    finger.midi = midi;
    return index === this.held.length - 1 ? [this.on(midi, finger.accent, true)] : [];
  }

  /** A finger lifts. */
  release(touch: number): LeadNoteEvent[] {
    const index = this.held.findIndex((finger) => finger.touch === touch);
    if (index < 0) return [];
    const wasSounding = index === this.held.length - 1;
    this.held.splice(index, 1);
    if (!wasSounding) return [];
    const previous = this.held.at(-1);
    if (previous) return [this.on(previous.midi, previous.accent, true)];
    return this.off();
  }

  /** Every finger lifts at once (cable cut, node removed, transport stopped). */
  releaseAll(): LeadNoteEvent[] {
    this.held = [];
    return this.off();
  }

  private on(midi: number, accent: boolean, legato: boolean): LeadNoteEvent {
    const id = this.nextId++;
    this.sounding = id;
    return { type: 'on', id, midi, accent, legato };
  }

  private off(): LeadNoteEvent[] {
    const id = this.sounding;
    this.sounding = null;
    return id === null ? [] : [{ type: 'off', id }];
  }
}
