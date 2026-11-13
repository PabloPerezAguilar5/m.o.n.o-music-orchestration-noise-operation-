import type { AudioStatus } from '../core/audio-scene';
import { generateDrumPattern, toggleDrumStep } from '../core/drum-patterns';
import { clamp, clampNodePosition, type Point } from '../core/geometry';
import { MACRO_PARAM, type DistType, type GridPatternId, type NodeId } from '../core/nodes';
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

  /** Sets a knob. On DRUM, CAOS regenerates the pattern from the current seed. */
  setParam(id: NodeId, param: string, value: number): void {
    const current = this.state.params[id];
    if (!(param in current)) return;
    const next = clamp(value, 0, 1);
    if (current[param] === next) return;
    const params = { ...this.state.params, [id]: { ...current, [param]: next } };
    if (id === 'drum' && param === MACRO_PARAM) {
      this.update({ params, drum: this.regenerated(this.state.drum.seed, next) });
    } else {
      this.update({ params });
    }
  }

  toggleStep(id: GridPatternId, row: number, col: number): void {
    const current = this.state.patterns[id];
    const next = toggleStep(current, row, col);
    if (next === current) return;
    this.update({ patterns: { ...this.state.patterns, [id]: next } });
  }

  /** Hand edit of a DRUM step: keeps the generation, so it sounds from the next step. */
  toggleDrumStep(row: number, col: number): void {
    const { drum } = this.state;
    const pattern = toggleDrumStep(drum.pattern, row, col);
    if (pattern === drum.pattern) return;
    this.update({ drum: { ...drum, pattern } });
  }

  /** Dice: a new seed and the pattern it generates at the current CAOS. */
  rollDice(seed: number): void {
    this.update({ drum: this.regenerated(seed >>> 0, this.state.params.drum[MACRO_PARAM] ?? 0) });
  }

  /** Next kit from the manifest, wrapping around. No-op until the manifest has loaded. */
  nextKit(): void {
    const { kits } = this.state.audio;
    if (kits.length === 0) return;
    const index = kits.indexOf(this.state.drum.kit);
    const kit = kits[(index + 1) % kits.length]!;
    if (kit === this.state.drum.kit) return;
    this.update({ drum: { ...this.state.drum, kit } });
  }

  setAudioStatus(audio: AudioStatus): void {
    if (audio === this.state.audio) return;
    this.update({ audio });
  }

  private regenerated(seed: number, chaos: number): AppState['drum'] {
    const { drum } = this.state;
    return {
      ...drum,
      seed,
      generation: drum.generation + 1,
      pattern: generateDrumPattern(seed, chaos),
    };
  }

  nudgeBpm(direction: 1 | -1): void {
    this.setBpm(this.state.transport.bpm + direction * BPM_NUDGE);
  }

  /** Sets the tempo, rounded to a whole bpm and clamped to the allowed range. */
  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    const { transport } = this.state;
    const next = clampBpm(Math.round(bpm));
    if (next === transport.bpm) return;
    this.update({ transport: { ...transport, bpm: next } });
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
