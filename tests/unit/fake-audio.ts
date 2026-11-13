/**
 * Minimal stand-ins for Web Audio objects, enough to test the graph in Node:
 * nodes record their connections and params record their automation.
 */

type ParamEvent =
  | { readonly kind: 'set'; readonly value: number; readonly time: number }
  | { readonly kind: 'ramp'; readonly value: number; readonly time: number }
  | { readonly kind: 'target'; readonly value: number; readonly time: number };

export class FakeParam {
  events: ParamEvent[] = [];
  constructor(public value: number) {}

  setValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'set', value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.events.push({ kind: 'ramp', value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number): this {
    this.events.push({ kind: 'target', value, time });
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.events = this.events.filter((event) => event.time < time);
    return this;
  }

  /** Value at `time` from set and linear ramp events (targets jump straight to their value). */
  valueAt(time: number): number {
    let value = this.value;
    let from = { time: -Infinity, value };
    for (const event of [...this.events].sort((a, b) => a.time - b.time)) {
      if (event.kind === 'ramp') {
        if (time < event.time) {
          if (time <= from.time) return from.value;
          const t = (time - from.time) / (event.time - from.time);
          return from.value + (event.value - from.value) * t;
        }
      } else if (time < event.time) {
        return value;
      }
      value = event.value;
      from = { time: event.time, value };
    }
    return value;
  }
}

export class FakeNode {
  readonly connections = new Set<FakeNode>();
  disposed = false;

  connect<T extends FakeNode>(destination: T): T {
    this.connections.add(destination);
    return destination;
  }

  disconnect(destination?: FakeNode): void {
    if (destination) this.connections.delete(destination);
    else this.connections.clear();
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

export class FakeContext {
  currentTime = 0;
  readonly gains: FakeGain[] = [];

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

/** A module with plain input and output nodes. */
export class FakeModule {
  readonly input = new FakeNode();
  readonly output = new FakeNode();
  disposed = false;
  dispose(): void {
    this.disposed = true;
  }
}

/** True if `to` can be reached from `from` through connections. */
export function reaches(from: FakeNode, to: FakeNode): boolean {
  const seen = new Set<FakeNode>();
  const walk = (node: FakeNode): boolean => {
    if (node === to) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    return [...node.connections].some(walk);
  };
  return walk(from);
}
