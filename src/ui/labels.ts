import type { DistType, NodeId } from '../core/nodes';

/** Interface texts (Spanish). */

export const NODE_NAMES: Readonly<Record<NodeId, string>> = {
  master: 'MASTER',
  synth: 'SYNTH',
  drum: 'DRUM',
  bass: 'BASS',
  drone: 'DRONE',
  dist: 'DISTORSIÓN',
  lfo: 'LFO',
  lead: 'LEAD',
};

export const NODE_CODES: Readonly<Record<NodeId, string>> = {
  master: 'MST-00',
  synth: 'SYN-01',
  drum: 'DRM-02',
  bass: 'BAS-03',
  drone: 'DRN-04',
  dist: 'DST-05',
  lfo: 'LFO-06',
  lead: 'LED-07',
};

/** Knob captions, in the same order as NODE_SPECS[id].params. */
export const KNOB_LABELS: Readonly<Record<NodeId, readonly string[]>> = {
  master: ['SYNTH', 'DRUM', 'BASS', 'DRONE', 'ESPACIO', 'VOL'],
  synth: ['ONDA', 'CUTOFF', 'RESO', 'ATAQUE', 'RELEASE', 'DETUNE'],
  drum: ['TONO', 'DECAY', 'VOL', 'SWING'],
  bass: ['CUTOFF', 'RESO', 'DECAY', 'DRIVE'],
  drone: ['TONO', 'DESAF.', 'FILTRO', 'VOL'],
  dist: ['DRIVE', 'TONO', 'MEZCLA'],
  lfo: ['FORMA', 'VELOC.', 'CANT.'],
  lead: ['ONDA', 'CUTOFF', 'RESO', 'ATAQUE', 'RELEASE', 'DETUNE'],
};

/** Sequencer row captions, in the same order as NODE_SPECS[id].rows. */
export const ROW_LABELS: Readonly<Record<NodeId, readonly string[]>> = {
  master: [],
  synth: ['NOTA', 'OCT', 'ACC'],
  drum: ['KCK', 'SNR', 'HAT', 'PRC'],
  bass: ['NOTA', 'SLD', 'ACC'],
  drone: [],
  dist: [],
  lfo: [],
  lead: [],
};

export const DIST_TYPE_LABELS: Readonly<Record<DistType, string>> = {
  soft: 'SUAVE',
  hard: 'DURA',
  crush: 'CRUSH',
};

export const TEXT = {
  logo: 'm.o.n.o',
  plaque: 'M.O.N.O',
  macroSection: 'MACRO',
  macroKnob: 'CAOS',
  hint: 'tocá + para agregar un nodo',
  play: 'Reproducir',
  stop: 'Detener',
  addNode: 'Agregar nodo',
  removeNode: 'Quitar nodo',
  slower: 'Bajar tempo',
  faster: 'Subir tempo',
  playStop: 'Reproducir o detener',
} as const;
