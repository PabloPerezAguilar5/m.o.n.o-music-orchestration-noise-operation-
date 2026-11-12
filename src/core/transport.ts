import { STEPS } from './patterns';

export const BPM_MIN = 40;
export const BPM_MAX = 300;
export const BPM_DEFAULT = 120;
export const BPM_NUDGE = 1;
export const STEPS_PER_BEAT = 4;

/** Beyond this many late steps the clock jumps ahead instead of replaying them. */
const MAX_CATCH_UP_STEPS = 4;

export const clampBpm = (bpm: number): number => Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));

/** Reads a tempo typed by the user: digits only, clamped to the range. Null if it is not a number. */
export function parseBpm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return clampBpm(Number(trimmed));
}

/** Length of one sixteenth-note step, in seconds. */
export const stepDuration = (bpm: number): number => 60 / bpm / STEPS_PER_BEAT;

/**
 * Derives step positions from elapsed time. It owns no timer: the caller passes
 * the current time (seconds, from any monotonic source) and gets back the steps
 * that have become due, so pacing never drifts with the polling rate.
 */
export class StepClock {
  private bpm: number;
  private step = -1;
  private nextTime: number | null = null;

  constructor(bpm: number = BPM_DEFAULT) {
    this.bpm = clampBpm(bpm);
  }

  get running(): boolean {
    return this.nextTime !== null;
  }

  /** Takes effect from the next step onwards. */
  setBpm(bpm: number): void {
    this.bpm = clampBpm(bpm);
  }

  /** Step 0 is due at `now`. */
  start(now: number): void {
    this.step = -1;
    this.nextTime = now;
  }

  stop(): void {
    this.step = -1;
    this.nextTime = null;
  }

  /** Steps due up to `now`, in order. */
  advance(now: number): number[] {
    if (this.nextTime === null) return [];
    const duration = stepDuration(this.bpm);

    const late = Math.floor((now - this.nextTime) / duration);
    if (late > MAX_CATCH_UP_STEPS) {
      // e.g. the tab was in the background: keep the phase, skip the backlog.
      this.step = (this.step + late) % STEPS;
      this.nextTime += late * duration;
    }

    const due: number[] = [];
    while (this.nextTime <= now) {
      this.step = (this.step + 1) % STEPS;
      due.push(this.step);
      this.nextTime += duration;
    }
    return due;
  }
}
