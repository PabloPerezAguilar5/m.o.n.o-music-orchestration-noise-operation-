/**
 * Keys for BASS, ported from fck-synth (bassPatterns.ts). A bass line uses five
 * scale degrees, from the tonic up, over the octave that starts at C2.
 */

/** The twelve tonics, spelled as in fck-synth (with ASCII # and b). */
export const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type Root = (typeof ROOTS)[number];

export const SCALE_IDS = ['pentaMinor', 'minor', 'major', 'dorian'] as const;
export type ScaleId = (typeof SCALE_IDS)[number];

/** Five degrees per scale, in semitones above the tonic (fck-synth's sets). */
export const SCALE_INTERVALS: Readonly<Record<ScaleId, readonly number[]>> = {
  pentaMinor: [0, 3, 5, 7, 10],
  minor: [0, 2, 3, 7, 10],
  major: [0, 2, 4, 7, 11],
  dorian: [0, 2, 3, 7, 9],
};

/** Notes per bass line. */
export const DEGREES = 5;

/** MIDI note of the tonic C2, the bottom of the bass range. */
export const BASS_BASE_MIDI = 36;

/** MIDI note of a degree (0 = tonic … 4 = highest) in a key. */
export function bassMidi(root: number, scale: ScaleId, degree: number): number {
  const intervals = SCALE_INTERVALS[scale];
  const index = Math.min(DEGREES - 1, Math.max(0, Math.round(degree)));
  return BASS_BASE_MIDI + (((Math.round(root) % 12) + 12) % 12) + (intervals[index] ?? 0);
}

/** Note name of a degree in a key, without octave (for row captions). */
export const degreeName = (root: number, scale: ScaleId, degree: number): Root =>
  ROOTS[bassMidi(root, scale, degree) % 12]!;

/** Frequency of a MIDI note, in Hz (A4 = 440). */
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
