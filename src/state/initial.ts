import { INITIAL_AUDIO_STATUS } from '../core/audio-scene';
import { DEFAULT_BASS_PATTERN } from '../core/bass-patterns';
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
import { DEFAULT_SYNTH_PATTERN } from '../core/synth-patterns';
import { BPM_DEFAULT } from '../core/transport';
import type { AppState, ParamValues } from './types';

const MACRO_DEFAULT = 0.2;
export const INITIAL_KIT = 'samples808';

/** Knobs start spread across their range, as in the prototype. */
const defaultParams = (id: NodeId): ParamValues => {
  const values: Record<string, number> = {};
  NODE_SPECS[id].params.forEach((param, index) => {
    values[param] = (0.35 + index * 0.11) % 1;
  });
  values[MACRO_PARAM] = MACRO_DEFAULT;
  return values;
};

/** BASS knobs start where the voice sounds like a classic 303 line. */
const defaultBassParams = (): ParamValues => ({
  cutoff: 0.45,
  resonance: 0.55,
  decay: 0.45,
  drive: 0.3,
  [MACRO_PARAM]: MACRO_DEFAULT,
});

/**
 * SYNTH knobs: ONDA keeps the prototype's position (mostly saw); the rest start where
 * the PLUCK preset sounds right (fast attack, medium release, some width).
 */
const defaultSynthParams = (): ParamValues => ({
  wave: 0.35,
  cutoff: 0.55,
  resonance: 0.3,
  attack: 0.05,
  release: 0.35,
  detune: 0.4,
  [MACRO_PARAM]: MACRO_DEFAULT,
});

/**
 * MASTER levels keep the prototype's knob positions; LEAD, added after it, starts at
 * unity like DRUM.
 */
const defaultMasterParams = (): ParamValues => ({
  synthLevel: 0.35,
  drumLevel: 0.46,
  bassLevel: 0.57,
  droneLevel: 0.68,
  leadLevel: 0.5,
  space: 0.79,
  volume: 0.9,
  [MACRO_PARAM]: MACRO_DEFAULT,
});

/** LEAD: a bright, playable mono line. CAOS starts at 0: the keys play what is pressed. */
const defaultLeadParams = (): ParamValues => ({
  wave: 0.3,
  cutoff: 0.6,
  resonance: 0.3,
  attack: 0.05,
  release: 0.3,
  glide: 0.2,
  [MACRO_PARAM]: 0,
});

/** DRONE: half-open filter, a slow swell, a long tail, a little drift. */
const defaultDroneParams = (): ParamValues => ({
  filter: 0.5,
  attack: 0.35,
  release: 0.45,
  detune: 0.3,
  volume: 0.7,
  [MACRO_PARAM]: MACRO_DEFAULT,
});

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
  params.bass = defaultBassParams();
  params.synth = defaultSynthParams();
  params.master = defaultMasterParams();
  params.lead = defaultLeadParams();
  params.drone = defaultDroneParams();
  return {
    added: ['master'],
    selected: 'master',
    positions: DEFAULT_POSITIONS,
    params,
    key: { root: 0, scale: 'pentaMinor' },
    // Starts with the prototype's pattern; the first press of RNDM replaces it.
    drum: {
      kit: INITIAL_KIT,
      seed: INITIAL_SEED,
      generation: 0,
      pattern: patternFromGrid(DEFAULT_PATTERNS.drum),
    },
    // Starts with the prototype's steps; DICE replaces it.
    bass: {
      seed: INITIAL_SEED,
      generation: 0,
      mode: 'pulse',
      pattern: DEFAULT_BASS_PATTERN,
      wave: 'saw',
      sub: false,
      slides: true,
    },
    // Starts with the prototype's NOTA steps; DICE replaces it.
    synth: {
      seed: INITIAL_SEED,
      generation: 0,
      mode: 'chords',
      preset: 'pluck',
      pattern: DEFAULT_SYNTH_PATTERN,
    },
    lead: { octave: 0, scaleLock: false },
    drone: { preset: 'drone', mode: 'touch' },
    unplugged: [],
    distType: 'soft',
    transport: { playing: false, bpm: BPM_DEFAULT, step: -1 },
    metronome: { on: false, volume: 0.7 },
    audio: INITIAL_AUDIO_STATUS,
  };
}
