import { INITIAL_AUDIO_STATUS, type AudioScene, type AudioStatus } from '../core/audio-scene';
import { clickAt, type Click } from '../core/metronome';
import { LookaheadScheduler } from '../core/scheduler';
import type { AudioBackend, StatusListener, StepListener } from './backend';

/**
 * Soundless backend for tests. Nothing runs on its own: the test moves time with
 * advanceTo(), and steps are delivered as they become due. DRUM counts as sounding
 * on a step when it is on the canvas and its pattern has a hit there.
 */
export class SilentBackend implements AudioBackend {
  readonly scenes: AudioScene[] = [];
  /** Kits asked to be heard, in order. */
  readonly auditions: string[] = [];
  /** Metronome clicks, with the time the scheduler gave their step. */
  readonly clicks: { step: number; time: number; click: Click }[] = [];
  unlocks = 0;
  private readonly scheduler = new LookaheadScheduler();
  private readonly statusListeners = new Set<StatusListener>();
  private listener: StepListener | null = null;
  private now = 0;

  get playing(): boolean {
    return this.scheduler.running;
  }

  unlock(): void {
    this.unlocks++;
  }

  start(onStep: StepListener): void {
    this.listener = onStep;
    this.scheduler.start(this.now);
  }

  stop(): void {
    this.listener = null;
    this.scheduler.stop(this.now);
  }

  update(scene: AudioScene): void {
    this.scenes.push(scene);
    this.scheduler.setBpm(scene.bpm);
  }

  audition(kit: string): void {
    this.auditions.push(kit);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Reports a status, as the real backend would. */
  emitStatus(status: AudioStatus = INITIAL_AUDIO_STATUS): void {
    for (const listener of this.statusListeners) listener(status);
  }

  /** Moves time to `now` (seconds) and delivers the steps that became due. */
  advanceTo(now: number): void {
    this.now = now;
    for (const { step, time } of this.scheduler.advance(now)) {
      const scene = this.scenes.at(-1);
      const click = scene?.metronome.on ? clickAt(step) : null;
      if (click) this.clicks.push({ step, time, click });
      const drumHits =
        scene !== undefined &&
        scene.nodes.includes('drum') &&
        scene.drum.pattern.some((row) => (row[step]?.length ?? 0) > 0);
      this.listener?.({ step, sounding: drumHits ? ['drum'] : [] });
    }
  }
}
