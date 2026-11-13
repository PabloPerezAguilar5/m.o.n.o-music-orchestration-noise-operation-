import { Emitter } from './emitter';

/** Seconds of wave kept, at most (the display shows up to 4). */
const SECONDS_KEPT = 8;
/** Without news for this long, the wave counts as stopped (no LFO, or no audio). */
const STALE_MS = 250;

/**
 * The LFO's wave as the audio thread runs it (-1..1, before CANTIDAD), for drawing: the
 * LFO panel's display, the rings on the knobs it moves, the glow of its node. Never
 * stored or saved; the audio pushes, the UI reads on each animation frame.
 */
export class LfoMonitor extends Emitter {
  private readonly buffer: Float32Array;
  private written = 0;
  private lastPush = -Infinity;

  constructor(
    /** Values per second the audio sends (LFO_TRACE_RATE). */
    readonly rate: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    super();
    this.buffer = new Float32Array(Math.ceil(rate * SECONDS_KEPT));
  }

  push(values: Float32Array): void {
    for (const value of values) {
      this.buffer[this.written % this.buffer.length] = value;
      this.written++;
    }
    this.lastPush = this.now();
  }

  /** Whether the wave is coming in. */
  get running(): boolean {
    return this.written > 0 && this.now() - this.lastPush < STALE_MS;
  }

  /** The latest value, 0 while stopped. */
  latest(): number {
    return this.running ? this.buffer[(this.written - 1) % this.buffer.length]! : 0;
  }

  /** The last `count` values, oldest first, into `out` (zeros where there is no history). */
  recent(count: number, out: Float32Array): void {
    const size = this.buffer.length;
    const n = Math.min(count, out.length);
    for (let i = 0; i < n; i++) {
      const index = this.written - n + i;
      out[i] = index >= 0 && this.written - index <= size ? this.buffer[index % size]! : 0;
    }
  }
}
