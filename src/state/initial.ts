import { DEFAULT_POSITIONS } from '../core/geometry';
import { MACRO_PARAM, NODE_IDS, NODE_SPECS, type NodeId } from '../core/nodes';
import { DEFAULT_PATTERNS } from '../core/patterns';
import { BPM_DEFAULT } from '../core/transport';
import type { AppState, ParamValues } from './types';

const MACRO_DEFAULT = 0.2;

/** Knobs start spread across their range, as in the prototype. */
const defaultParams = (id: NodeId): ParamValues => {
  const values: Record<string, number> = {};
  NODE_SPECS[id].params.forEach((param, index) => {
    values[param] = (0.35 + index * 0.11) % 1;
  });
  values[MACRO_PARAM] = MACRO_DEFAULT;
  return values;
};

export function createInitialState(): AppState {
  return {
    added: ['master'],
    selected: 'master',
    positions: DEFAULT_POSITIONS,
    params: Object.fromEntries(NODE_IDS.map((id) => [id, defaultParams(id)])) as Record<
      NodeId,
      ParamValues
    >,
    patterns: DEFAULT_PATTERNS,
    drone: { x: 0.5, y: 0.5 },
    distType: 'soft',
    transport: { playing: false, bpm: BPM_DEFAULT, step: -1 },
  };
}
