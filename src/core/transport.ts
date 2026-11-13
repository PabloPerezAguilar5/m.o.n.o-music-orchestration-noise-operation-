export const BPM_MIN = 40;
export const BPM_MAX = 300;
export const BPM_DEFAULT = 120;
export const BPM_NUDGE = 1;
export const STEPS_PER_BEAT = 4;

export const clampBpm = (bpm: number): number => Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));

/** Reads a tempo typed by the user: digits only, clamped to the range. Null if it is not a number. */
export function parseBpm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return clampBpm(Number(trimmed));
}

/** Length of one sixteenth-note step, in seconds. */
export const stepDuration = (bpm: number): number => 60 / bpm / STEPS_PER_BEAT;
