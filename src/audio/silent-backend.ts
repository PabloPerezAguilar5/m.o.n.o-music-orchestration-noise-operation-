import { StepClock } from '../core/transport';
import type { AudioBackend, StepListener } from './backend';

/**
 * Soundless backend for stage 1. It only moves the playhead, reading
 * performance.now() once per animation frame. The real backend replaces it
 * with a lookahead scheduler against AudioContext.currentTime.
 */
export class SilentBackend implements AudioBackend {
  private readonly clock: StepClock;
  private onStep: StepListener | null = null;
  private frame = 0;

  constructor(bpm?: number) {
    this.clock = new StepClock(bpm);
  }

  start(onStep: StepListener): void {
    this.stop();
    this.onStep = onStep;
    this.clock.start(now());
    this.frame = requestAnimationFrame(this.pump);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.clock.stop();
    this.onStep = null;
  }

  setBpm(bpm: number): void {
    this.clock.setBpm(bpm);
  }

  private readonly pump = (): void => {
    const listener = this.onStep;
    if (!listener) return;
    for (const step of this.clock.advance(now())) listener(step);
    if (this.onStep) this.frame = requestAnimationFrame(this.pump);
  };
}

const now = (): number => performance.now() / 1000;
