/** Note names by pitch class, C = 0. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
/** Pitch classes played on white keys: C D E F G A B. */
const WHITE_PITCH_CLASSES: ReadonlySet<number> = new Set([0, 2, 4, 5, 7, 9, 11]);

export interface WhiteKey {
  readonly label: string;
  /** Semitones above the first key. */
  readonly semitone: number;
}

export interface BlackKey {
  readonly label: string;
  readonly semitone: number;
  /** Index of the white key on its left; the black key sits on that key's right edge. */
  readonly after: number;
}

export interface KeyboardLayout {
  readonly white: readonly WhiteKey[];
  readonly black: readonly BlackKey[];
}

const noteName = (semitone: number): string => NOTE_NAMES[semitone % 12] ?? '';

/**
 * Piano layout with `whiteCount` white keys, starting on C. Black keys fall
 * where a piano has them: C-D, D-E, F-G, G-A and A-B, never E-F or B-C.
 */
export function keyboardLayout(whiteCount: number): KeyboardLayout {
  const white: WhiteKey[] = [];
  const black: BlackKey[] = [];
  for (let semitone = 0; white.length < whiteCount; semitone++) {
    const label = noteName(semitone);
    if (WHITE_PITCH_CLASSES.has(semitone % 12)) white.push({ label, semitone });
    else black.push({ label, semitone, after: white.length - 1 });
  }
  return { white, black };
}
