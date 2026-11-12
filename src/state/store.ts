import { clamp, clampNodePosition, type Point } from '../core/geometry';
import type { DistType, NodeId, SequencedId } from '../core/nodes';
import { toggleStep } from '../core/patterns';
import { BPM_NUDGE, clampBpm } from '../core/transport';
import { Emitter, type Source } from './emitter';
import { createInitialState } from './initial';
import type { AppState } from './types';

/** Application state plus the actions that change it. State objects are never mutated. */
export class Store extends Emitter implements Source<AppState> {
  private state: AppState;

  constructor(initial: AppState = createInitialState()) {
    super();
    this.state = initial;
  }

  readonly getState = (): AppState => this.state;

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private has(id: NodeId): boolean {
    return this.state.added.includes(id);
  }

  /** Adds a node, selects it and starts playback. Returns false if it was already there. */
  addNode(id: NodeId): boolean {
    if (this.has(id)) return false;
    const { added, transport } = this.state;
    this.update({
      added: [...added, id],
      selected: id,
      transport: transport.playing ? transport : { ...transport, playing: true },
    });
    return true;
  }

  /** Removes a node (never MASTER). Selection falls back to MASTER if it was selected. */
  removeNode(id: NodeId): void {
    if (id === 'master' || !this.has(id)) return;
    const { added, selected } = this.state;
    this.update({
      added: added.filter((other) => other !== id),
      selected: selected === id ? 'master' : selected,
    });
  }

  selectNode(id: NodeId): void {
    if (!this.has(id) || this.state.selected === id) return;
    this.update({ selected: id });
  }

  /** Moves a node within the canvas bounds. MASTER stays put. */
  moveNode(id: NodeId, point: Point): void {
    if (id === 'master' || !this.has(id)) return;
    this.update({ positions: { ...this.state.positions, [id]: clampNodePosition(point) } });
  }

  setParam(id: NodeId, param: string, value: number): void {
    const current = this.state.params[id];
    if (!(param in current)) return;
    this.update({
      params: { ...this.state.params, [id]: { ...current, [param]: clamp(value, 0, 1) } },
    });
  }

  toggleStep(id: SequencedId, row: number, col: number): void {
    const current = this.state.patterns[id];
    const next = toggleStep(current, row, col);
    if (next === current) return;
    this.update({ patterns: { ...this.state.patterns, [id]: next } });
  }

  nudgeBpm(direction: 1 | -1): void {
    const { transport } = this.state;
    const bpm = clampBpm(transport.bpm + direction * BPM_NUDGE);
    if (bpm === transport.bpm) return;
    this.update({ transport: { ...transport, bpm } });
  }

  togglePlay(): void {
    const { transport } = this.state;
    this.update({ transport: { ...transport, playing: !transport.playing, step: -1 } });
  }

  /** Playhead position reported by the backend; ignored while stopped. */
  setStep(step: number): void {
    const { transport } = this.state;
    if (!transport.playing || transport.step === step) return;
    this.update({ transport: { ...transport, step } });
  }

  setDronePosition(point: Point): void {
    this.update({ drone: { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) } });
  }

  setDistType(type: DistType): void {
    if (this.state.distType === type) return;
    this.update({ distType: type });
  }
}
