import type { AudioStatus } from '../core/audio-scene';
import { generateDrumPattern, sameGrid, toggleDrumStep } from '../core/drum-patterns';
import { clamp, clampNodePosition, type Point } from '../core/geometry';
import { MACRO_PARAM, type DistType, type GridPatternId, type NodeId } from '../core/nodes';
import { toggleStep } from '../core/patterns';
import { BPM_NUDGE, clampBpm } from '../core/transport';
import { Emitter, type Source } from './emitter';
import { createInitialState } from './initial';
import type { AppState } from './types';

/** Seeds RNDM tries before settling for one that lights the same steps (practically never). */
const RANDOMIZE_ATTEMPTS = 16;

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

  /**
   * RNDM: a pattern from a new seed at the current CAOS, always different on the step
   * grid from the one playing. Seeds that would light the same steps are skipped.
   */
  randomize(nextSeed: () => number): void {
    const chaos = this.state.params.drum[MACRO_PARAM] ?? 0;
    const current = this.state.drum.pattern;
    let drum = this.regenerated(nextSeed() >>> 0, chaos);
    for (let attempt = 1; attempt < RANDOMIZE_ATTEMPTS && sameGrid(drum.pattern, current); attempt++) {
      drum = this.regenerated(nextSeed() >>> 0, chaos);
    }
    this.update({ drum });
  }

  /** Picks a kit from the manifest. No-op for a kit the manifest does not list. */
  selectKit(kit: string): void {
    if (!this.state.audio.kits.includes(kit) || kit === this.state.drum.kit) return;
    this.update({ drum: { ...this.state.drum, kit } });
  }

  toggleMetronome(): void {
    const { metronome } = this.state;
    this.update({ metronome: { ...metronome, on: !metronome.on } });
  }

  setMetronomeVolume(volume: number): void {
    const { metronome } = this.state;
    const next = clamp(volume, 0, 1);
    if (next === metronome.volume) return;
    this.update({ metronome: { ...metronome, volume: next } });
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
