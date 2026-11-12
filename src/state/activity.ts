import type { NodeId } from '../core/nodes';
import { Emitter, type Source } from './emitter';

/**
 * Which nodes are lit right now. Kept apart from the Store so a flash only
 * redraws the canvas. The timers here fade a light out; they never schedule music.
 */
export class Activity extends Emitter implements Source<ReadonlySet<NodeId>> {
  private lit: ReadonlySet<NodeId> = new Set();
  private readonly timers = new Map<NodeId, ReturnType<typeof setTimeout>>();

  readonly getState = (): ReadonlySet<NodeId> => this.lit;

  /** Lights a node for `ms`; pulsing again restarts its timer. */
  pulse(id: NodeId, ms = 300): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.set(id, false);
      }, ms),
    );
    this.set(id, true);
  }

  private set(id: NodeId, on: boolean): void {
    if (this.lit.has(id) === on) return;
    const next = new Set(this.lit);
    if (on) next.add(id);
    else next.delete(id);
    this.lit = next;
    this.emit();
  }
}
