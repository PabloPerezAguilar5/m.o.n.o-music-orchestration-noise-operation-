import { DEFAULT_POSITIONS } from '../core/geometry';
import { NODE_IDS, type NodeId } from '../core/nodes';
import { PATCH_VERSION, type Patch } from '../core/patch';
import { createInitialState } from './initial';
import type { AppState, ParamValues } from './types';

/**
 * Between the app state and a patch. A patch is the lasting part of the state: what is
 * on the canvas and how it is set. The transient part (playing, playhead, audio status,
 * selection) stays with the session.
 */

/** The patch for a state, named and dated. */
export function patchFromState(state: AppState, name: string, date: string): Patch {
  const positions: Partial<Record<NodeId, AppState['positions'][NodeId]>> = {};
  const params: Partial<Record<NodeId, ParamValues>> = {};
  for (const id of NODE_IDS) {
    if (id !== 'master') positions[id] = state.positions[id];
    params[id] = state.params[id];
  }
  const { bass, drum, synth } = state;
  return {
    v: PATCH_VERSION,
    name,
    date,
    bpm: state.transport.bpm,
    key: state.key,
    nodes: state.added,
    positions,
    params,
    cables: state.cables,
    drum: { kit: drum.kit, seed: drum.seed, pattern: drum.pattern },
    bass: {
      voice: bass.voice,
      seed: bass.seed,
      mode: bass.mode,
      pattern: bass.pattern,
      wave: bass.wave,
      sub: bass.sub,
      slides: bass.slides,
      slice: {
        category: bass.slice.category,
        loop: bass.slice.loop,
        bar: bass.slice.bar,
        sync: bass.slice.sync,
        reverse: bass.slice.reverse,
        mode: bass.slice.mode,
        seed: bass.slice.seed,
        pattern: bass.slice.pattern,
      },
    },
    synth: { seed: synth.seed, mode: synth.mode, preset: synth.preset, pattern: synth.pattern },
    lead: state.lead,
    drone: state.drone,
    distType: state.distType,
    lfo: state.lfo,
    metronome: state.metronome,
  };
}

/**
 * The state a patch describes, on top of the session's transient part. Knobs the patch
 * does not name take their defaults, never the previous session's values, so the same
 * patch always loads the same. Patterns count as regenerated (their generation moves),
 * so the audio takes them at the next bar, like DICE.
 */
export function stateFromPatch(current: AppState, patch: Patch): AppState {
  const base = createInitialState();
  const params = Object.fromEntries(
    NODE_IDS.map((id) => [id, { ...base.params[id], ...(patch.params[id] ?? {}) }]),
  ) as Record<NodeId, ParamValues>;
  const positions = { ...DEFAULT_POSITIONS, ...patch.positions, master: DEFAULT_POSITIONS.master };
  const added = patch.nodes.includes('master') ? patch.nodes : ['master' as const, ...patch.nodes];
  return {
    added,
    selected: added.includes(current.selected) ? current.selected : 'master',
    positions,
    params,
    key: patch.key,
    drum: { ...patch.drum, generation: current.drum.generation + 1 },
    bass: {
      ...base.bass,
      voice: patch.bass.voice,
      seed: patch.bass.seed,
      mode: patch.bass.mode,
      pattern: patch.bass.pattern,
      wave: patch.bass.wave,
      sub: patch.bass.sub,
      slides: patch.bass.slides,
      generation: current.bass.generation + 1,
      slice: { ...patch.bass.slice, generation: current.bass.slice.generation + 1 },
    },
    synth: { ...patch.synth, generation: current.synth.generation + 1 },
    lead: patch.lead,
    drone: patch.drone,
    cables: patch.cables,
    distType: patch.distType,
    lfo: patch.lfo,
    transport: { ...current.transport, bpm: patch.bpm },
    metronome: patch.metronome,
    audio: current.audio,
  };
}

/**
 * The canvas as just opened: only MASTER, no cables, every node back to its defaults
 * (so adding one later starts fresh), stopped, MASTER selected. What belongs to the
 * listener, not to a patch, stays: MASTER's knobs (levels, space, volume, macro), the
 * tempo and the metronome. Built as a patch and loaded like one, so the audio sees an
 * ordinary new scene. The key (tonic and scale) goes back to its default: it is part of
 * what the nodes play, not a setting of the MASTER.
 */
export function clearedState(current: AppState): AppState {
  const fresh = createInitialState();
  const kept: AppState = {
    ...fresh,
    params: { ...fresh.params, master: current.params.master },
    transport: { ...fresh.transport, bpm: current.transport.bpm },
    metronome: current.metronome,
  };
  const next = stateFromPatch(current, patchFromState(kept, '', ''));
  return { ...next, selected: 'master', transport: { ...current.transport, bpm: current.transport.bpm, playing: false, step: -1, sliceBar: 0 } };
}

/**
 * The parts of the state a patch keeps, as one list: when none of them changed
 * identity, nothing worth saving happened (the playhead moving, a status update).
 */
export const persistentSlice = (state: AppState): readonly unknown[] => [
  state.added,
  state.positions,
  state.params,
  state.key,
  state.drum,
  state.bass,
  state.synth,
  state.lead,
  state.drone,
  state.cables,
  state.distType,
  state.lfo,
  state.transport.bpm,
  state.metronome,
];

export const sameSlice = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);
