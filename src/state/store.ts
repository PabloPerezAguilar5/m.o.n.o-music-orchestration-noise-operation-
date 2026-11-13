import type { AudioStatus } from '../core/audio-scene';
import {
  EMPTY_BASS_PATTERN,
  generateBassPattern,
  sameBassGrid,
  toggleBassCell,
  type BassMode,
} from '../core/bass-patterns';
import { SCALE_IDS } from '../core/scales';
import { EMPTY_DRUM_PATTERN, generateDrumPattern, sameGrid, toggleDrumStep } from '../core/drum-patterns';
import { clamp, clampNodePosition, type Point } from '../core/geometry';
import { MACRO_PARAM, type DistType, type NodeId } from '../core/nodes';
import {
  EMPTY_SYNTH_PATTERN,
  generateSynthPattern,
  sameSynthGrid,
  toggleSynthCell,
  type SynthMode,
} from '../core/synth-patterns';
import type { SynthPreset } from '../core/synth-voices';
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
    const { added, selected, unplugged } = this.state;
    this.update({
      added: added.filter((other) => other !== id),
      selected: selected === id ? 'master' : selected,
      // A node added again comes back plugged in.
      unplugged: unplugged.filter((other) => other !== id),
    });
  }

  /** Cuts a node's cable to MASTER, or plugs it back. MASTER has no cable. */
  toggleCable(id: NodeId): void {
    if (id === 'master' || !this.has(id)) return;
    const { unplugged } = this.state;
    this.update({
      unplugged: unplugged.includes(id) ? unplugged.filter((other) => other !== id) : [...unplugged, id],
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

  /** Sets a knob. On DRUM, BASS and SYNTH, CAOS regenerates the pattern from the current seed. */
  setParam(id: NodeId, param: string, value: number): void {
    const current = this.state.params[id];
    if (!(param in current)) return;
    const next = clamp(value, 0, 1);
    if (current[param] === next) return;
    const params = { ...this.state.params, [id]: { ...current, [param]: next } };
    if (id === 'drum' && param === MACRO_PARAM) {
      this.update({ params, drum: this.regenerated(this.state.drum.seed, next) });
    } else if (id === 'bass' && param === MACRO_PARAM) {
      const { bass } = this.state;
      this.update({ params, bass: this.regeneratedBass(bass.mode, bass.seed, next) });
    } else if (id === 'synth' && param === MACRO_PARAM) {
      const { synth } = this.state;
      this.update({ params, synth: this.regeneratedSynth(synth.mode, synth.seed, next) });
    } else {
      this.update({ params });
    }
  }

  // Key (shared by BASS and SYNTH) ------------------------------------------------------------

  /** Steps the tonic up or down a semitone, wrapping around the octave. */
  nudgeRoot(direction: 1 | -1): void {
    const { key } = this.state;
    this.update({ key: { ...key, root: (key.root + direction + 12) % 12 } });
  }

  /** Steps through the scales, wrapping around. */
  nudgeScale(direction: 1 | -1): void {
    const { key } = this.state;
    const index = SCALE_IDS.indexOf(key.scale);
    const scale = SCALE_IDS[(index + direction + SCALE_IDS.length) % SCALE_IDS.length]!;
    this.update({ key: { ...key, scale } });
  }

  /** Hand edit of a DRUM step: keeps the generation, so it sounds from the next step. */
  /**
   * BORRAR: empties the pattern of a sequenced node (DRUM, BASS or SYNTH). Like a hand
   * edit, it keeps the generation and goes silent from the next step; CAOS, RNDM and
   * DICE fill it again.
   */
  clearPattern(id: NodeId): void {
    if (id === 'drum') this.update({ drum: { ...this.state.drum, pattern: EMPTY_DRUM_PATTERN } });
    else if (id === 'bass') this.update({ bass: { ...this.state.bass, pattern: EMPTY_BASS_PATTERN } });
    else if (id === 'synth') this.update({ synth: { ...this.state.synth, pattern: EMPTY_SYNTH_PATTERN } });
  }

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

  // BASS ----------------------------------------------------------------------------------------

  /** Hand edit of the BASS grid (note, SLD or ACC). Keeps the generation: it sounds from the next step. */
  toggleBassStep(row: number, col: number): void {
    const { bass } = this.state;
    const pattern = toggleBassCell(bass.pattern, row, col);
    if (pattern === bass.pattern) return;
    this.update({ bass: { ...bass, pattern } });
  }

  /**
   * DICE: a pattern in the current mode from a new seed, at the current CAOS. Always
   * different on the grid from the one playing.
   */
  randomizeBass(nextSeed: () => number): void {
    const { bass } = this.state;
    const chaos = this.state.params.bass[MACRO_PARAM] ?? 0;
    let next = this.regeneratedBass(bass.mode, nextSeed() >>> 0, chaos);
    for (let attempt = 1; attempt < RANDOMIZE_ATTEMPTS && sameBassGrid(next.pattern, bass.pattern); attempt++) {
      next = this.regeneratedBass(bass.mode, nextSeed() >>> 0, chaos);
    }
    this.update({ bass: next });
  }

  /** Picks a mode: its voice character, and a pattern in that mode from the current seed. */
  setBassMode(mode: BassMode): void {
    const { bass } = this.state;
    if (bass.mode === mode) return;
    this.update({ bass: this.regeneratedBass(mode, bass.seed, this.state.params.bass[MACRO_PARAM] ?? 0) });
  }

  toggleBassWave(): void {
    const { bass } = this.state;
    this.update({ bass: { ...bass, wave: bass.wave === 'saw' ? 'square' : 'saw' } });
  }

  /** SLIDE ON/OFF: switches every slide off (or back on) without touching the marks. */
  toggleBassSlides(): void {
    const { bass } = this.state;
    this.update({ bass: { ...bass, slides: !bass.slides } });
  }

  toggleBassSub(): void {
    const { bass } = this.state;
    this.update({ bass: { ...bass, sub: !bass.sub } });
  }

  private regeneratedBass(mode: BassMode, seed: number, chaos: number): AppState['bass'] {
    const { bass } = this.state;
    return {
      ...bass,
      mode,
      seed,
      generation: bass.generation + 1,
      pattern: generateBassPattern(mode, seed, chaos),
    };
  }

  // SYNTH ---------------------------------------------------------------------------------------

  /** Hand edit of the SYNTH grid (a chord note or DUR). Keeps the generation: it sounds from the next step. */
  toggleSynthStep(row: number, col: number): void {
    const { synth } = this.state;
    const pattern = toggleSynthCell(synth.pattern, row, col);
    if (pattern === synth.pattern) return;
    this.update({ synth: { ...synth, pattern } });
  }

  /** DICE: a pattern in the current mode from a new seed, always different on the grid. */
  randomizeSynth(nextSeed: () => number): void {
    const { synth } = this.state;
    const chaos = this.state.params.synth[MACRO_PARAM] ?? 0;
    let next = this.regeneratedSynth(synth.mode, nextSeed() >>> 0, chaos);
    for (let attempt = 1; attempt < RANDOMIZE_ATTEMPTS && sameSynthGrid(next.pattern, synth.pattern); attempt++) {
      next = this.regeneratedSynth(synth.mode, nextSeed() >>> 0, chaos);
    }
    this.update({ synth: next });
  }

  /** Picks a DICE mode and plays a pattern in it from the current seed. */
  setSynthMode(mode: SynthMode): void {
    const { synth } = this.state;
    if (synth.mode === mode) return;
    this.update({ synth: this.regeneratedSynth(mode, synth.seed, this.state.params.synth[MACRO_PARAM] ?? 0) });
  }

  /** Picks the sound (PLUCK, PAD, STAB, GLASS). The pattern stays. */
  setSynthPreset(preset: SynthPreset): void {
    const { synth } = this.state;
    if (synth.preset === preset) return;
    this.update({ synth: { ...synth, preset } });
  }

  private regeneratedSynth(mode: SynthMode, seed: number, chaos: number): AppState['synth'] {
    const { synth } = this.state;
    return {
      ...synth,
      mode,
      seed,
      generation: synth.generation + 1,
      pattern: generateSynthPattern(mode, seed, chaos),
    };
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
