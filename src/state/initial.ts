import { INITIAL_AUDIO_STATUS } from '../core/audio-scene';
import { INITIAL_SEED, patternFromGrid } from '../core/drum-patterns';
import { DEFAULT_POSITIONS } from '../core/geometry';
import {
  DRUM_ROWS,
  drumToneParam,
  drumVolumeParam,
  MACRO_PARAM,
  NODE_IDS,
  NODE_SPECS,
  type NodeId,
} from '../core/nodes';
import { DEFAULT_PATTERNS } from '../core/patterns';
import { BPM_DEFAULT } from '../core/transport';
import type { AppState, ParamValues } from './types';

const MACRO_DEFAULT = 0.2;
export const INITIAL_KIT = '909samples';

/** Knobs start spread across their range, as in the prototype. */
const defaultParams = (id: NodeId): ParamValues => {
  const values: Record<string, number> = {};
  NODE_SPECS[id].params.forEach((param, index) => {
    values[param] = (0.35 + index * 0.11) % 1;
  });
  values[MACRO_PARAM] = MACRO_DEFAULT;
  return values;
};

/** DRUM knobs are real controls: tone centred (original pitch), volume at unity. */
const defaultDrumParams = (): ParamValues => {
  const values: Record<string, number> = { [MACRO_PARAM]: MACRO_DEFAULT };
  for (const row of DRUM_ROWS) {
    values[drumToneParam(row)] = 0.5;
    values[drumVolumeParam(row)] = 0.9;
  }
  return values;
};

export function createInitialState(): AppState {
  const params = Object.fromEntries(NODE_IDS.map((id) => [id, defaultParams(id)])) as Record<
    NodeId,
    ParamValues
  >;
  params.drum = defaultDrumParams();
  return {
    added: ['master'],
    selected: 'master',
    positions: DEFAULT_POSITIONS,
    params,
    patterns: { synth: DEFAULT_PATTERNS.synth, bass: DEFAULT_PATTERNS.bass },
    // Starts with the prototype's pattern; the first roll of the dice replaces it.
    drum: {
      kit: INITIAL_KIT,
      seed: INITIAL_SEED,
      generation: 0,
      pattern: patternFromGrid(DEFAULT_PATTERNS.drum),
    },
    drone: { x: 0.5, y: 0.5 },
    distType: 'soft',
    transport: { playing: false, bpm: BPM_DEFAULT, step: -1 },
    audio: INITIAL_AUDIO_STATUS,
  };
}
