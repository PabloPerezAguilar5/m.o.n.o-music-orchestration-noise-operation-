import { STEPS } from './patterns';
import { BPM_DEFAULT, clampBpm, stepDuration } from './transport';

/** A step placed on the timeline. */
export interface ScheduledStep {
  /** 0..15 */
  readonly step: number;
  /** Bars since start, from 0. */
  readonly bar: number;
  /** When the step starts, in the caller's clock (seconds). */
  readonly time: number;
  /** Length of this step, in seconds, at the tempo it was scheduled with. */
  readonly duration: number;
}

export type BarAction = (time: number) => void;

export interface SchedulerOptions {
  /** How far ahead of `now` steps are handed out, in seconds. 0 = only steps already due. */
  readonly lookahead?: number;
  /**
   * A step later than this (seconds) is never played: the clock jumps ahead keeping
   * its phase, e.g. after the tab was frozen in the background.
   */
  readonly maxLateness?: number;
}

/**
 * The musical clock, ported from fck-synth's DrumEngine and m.o.n.o-studio's LiveEngine.
 * It owns no timer. The caller wakes it up with the current time of its clock
 * (AudioContext.currentTime in the app) and gets back every step that starts before
 * `now + lookahead`, with its exact start time. Polling irregularly never causes drift.
 *
 * Structural changes are queued with atNextBar() and run when step 0 of the next bar
 * is handed out, with that step's start time.
 */
export class LookaheadScheduler {
  readonly lookahead: number;
  private readonly maxLateness: number;
  private bpm: number;
  private tick = 0;
  private nextTime: number | null = null;
  private barActions: BarAction[] = [];

  constructor(bpm: number = BPM_DEFAULT, options: SchedulerOptions = {}) {
    this.bpm = clampBpm(bpm);
    this.lookahead = options.lookahead ?? 0;
    this.maxLateness = options.maxLateness ?? 0.1;
  }

  get running(): boolean {
    return this.nextTime !== null;
  }

  get tempo(): number {
    return this.bpm;
  }

  /** Takes effect from the next step handed out. */
  setBpm(bpm: number): void {
    this.bpm = clampBpm(bpm);
  }

  /** Step 0 of bar 0 starts at `time`. Actions queued while stopped run at that time. */
  start(time: number): void {
    this.tick = 0;
    this.nextTime = time;
  }

  /** Stops the clock. Queued bar actions cannot wait for a bar that will not come: they run at `now`. */
  stop(now: number): void {
    this.tick = 0;
    this.nextTime = null;
    this.runBarActions(now);
  }

  /**
   * Queues a structural change for the start of the next bar.
   * Returns false, without queueing, when the clock is stopped: then the caller applies it now.
   */
  atNextBar(action: BarAction): boolean {
    if (this.nextTime === null) return false;
    this.barActions.push(action);
    return true;
  }

  /** Steps that start before `now + lookahead`, in order. */
  advance(now: number): ScheduledStep[] {
    if (this.nextTime === null) return [];
    let duration = stepDuration(this.bpm);

    if (now - this.nextTime > this.maxLateness) {
      // Late steps are lost anyway: skip them, keeping the step grid in phase.
      const missed = Math.ceil((now - this.nextTime - this.maxLateness) / duration);
      this.tick += missed;
      this.nextTime += missed * duration;
    }

    const due: ScheduledStep[] = [];
    while (this.nextTime !== null && this.nextTime <= now + this.lookahead) {
      const time: number = this.nextTime;
      const step = this.tick % STEPS;
      if (step === 0) this.runBarActions(time);
      duration = stepDuration(this.bpm);
      due.push({ step, bar: Math.floor(this.tick / STEPS), time, duration });
      this.tick++;
      this.nextTime = time + duration;
    }
    return due;
  }

  private runBarActions(time: number): void {
    const actions = this.barActions;
    this.barActions = [];
    for (const action of actions) action(time);
  }
}
