import type { NodeId } from '../core/nodes';
import { Emitter, type Source } from './emitter';

/**
 * Which nodes are lit right now. Kept apart from the Store so a flash only
 * redraws the canvas. The timers here fade a light out; they never schedule music.
 *
 * A node is lit while it pulses (a hit, for a moment) or while it is held lit (a LEAD
 * note or a DRONE layer sounding, for as long as it does).
 */
export class Activity extends Emitter implements Source<ReadonlySet<NodeId>> {
  private lit: ReadonlySet<NodeId> = new Set();
  private readonly timers = new Map<NodeId, ReturnType<typeof setTimeout>>();
  private readonly held = new Set<NodeId>();

  readonly getState = (): ReadonlySet<NodeId> => this.lit;

  /** Lights a node for `ms`; pulsing again restarts its timer. */
  pulse(id: NodeId, ms = 300): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.refresh(id);
      }, ms),
    );
    this.refresh(id);
  }

  /** Keeps a node lit until it is let go (`on` false). A pulse still running stays. */
  hold(id: NodeId, on: boolean): void {
    if (on) this.held.add(id);
    else this.held.delete(id);
    this.refresh(id);
  }

  private refresh(id: NodeId): void {
    const on = this.held.has(id) || this.timers.has(id);
    if (this.lit.has(id) === on) return;
    const next = new Set(this.lit);
    if (on) next.add(id);
    else next.delete(id);
    this.lit = next;
    this.emit();
  }
}
