/**
 * The key shared by BASS and SYNTH, ported from fck-synth (bassPatterns.ts): a tonic
 * and a five-note scale. Instruments count notes as scale steps from the tonic of
 * their own base octave: steps 0..4 are the first octave, 5..9 the next, and so on.
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

/** Notes per octave of a scale. */
export const DEGREES = 5;

/** MIDI note of the tonic C2, the bottom of the BASS range (one octave). */
export const BASS_BASE_MIDI = 36;
/** MIDI note of C3, the bottom of the SYNTH range (two octaves). */
export const SYNTH_BASE_MIDI = 48;
/** SYNTH range, in scale steps: two octaves. */
export const SYNTH_STEPS = DEGREES * 2;

/**
 * MIDI note of scale step `index` (0 = tonic of the base octave; 5 = the tonic one
 * octave up) for a tonic 0..11 and a scale, over the octave of `base`.
 */
export function scaleMidi(base: number, root: number, scale: ScaleId, index: number): number {
  const step = Math.max(0, Math.round(index));
  const octave = Math.floor(step / DEGREES);
  const interval = SCALE_INTERVALS[scale][step % DEGREES] ?? 0;
  return base + (((Math.round(root) % 12) + 12) % 12) + octave * 12 + interval;
}

/** MIDI note of a BASS degree (0 = tonic … 4 = highest). */
export const bassMidi = (root: number, scale: ScaleId, degree: number): number =>
  scaleMidi(BASS_BASE_MIDI, root, scale, Math.min(DEGREES - 1, Math.max(0, degree)));

/** MIDI note of a SYNTH step (0 … 9, two octaves). */
export const synthMidi = (root: number, scale: ScaleId, index: number): number =>
  scaleMidi(SYNTH_BASE_MIDI, root, scale, Math.min(SYNTH_STEPS - 1, Math.max(0, index)));

/** Note name of a scale step in a key, without octave (for row captions). */
export const degreeName = (root: number, scale: ScaleId, index: number): Root =>
  ROOTS[scaleMidi(0, root, scale, index) % 12]!;

/** Frequency of a MIDI note, in Hz (A4 = 440). */
export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
