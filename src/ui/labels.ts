import type { BassMode } from '../core/bass-patterns';
import { DEGREES, degreeName, ROOTS, SYNTH_STEPS, synthMidi, type ScaleId } from '../core/scales';
import type { SynthMode } from '../core/synth-patterns';
import type { SynthPreset } from '../core/synth-voices';
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
  drum: ['TONO', 'VOL', 'TONO', 'VOL', 'TONO', 'VOL', 'TONO', 'VOL'],
  bass: ['CUTOFF', 'RESO', 'DECAY', 'DRIVE'],
  drone: ['TONO', 'DESAF.', 'FILTRO', 'VOL'],
  dist: ['DRIVE', 'TONO', 'MEZCLA'],
  lfo: ['FORMA', 'VELOC.', 'CANT.'],
  lead: ['ONDA', 'CUTOFF', 'RESO', 'ATAQUE', 'RELEASE', 'DETUNE'],
};

/**
 * Sequencer row captions, in the same order as NODE_SPECS[id].rows. BASS names its
 * five note rows after the key (bassRowLabels); these are its last two.
 */
export const ROW_LABELS: Readonly<Record<NodeId, readonly string[]>> = {
  master: [],
  synth: ['DUR'],
  drum: ['KCK', 'SNR', 'HAT', 'PRC'],
  bass: ['SLD', 'ACC'],
  drone: [],
  dist: [],
  lfo: [],
  lead: [],
};

/** BASS grid captions: the five notes of the key (highest on top), then SLD and ACC. */
export const bassRowLabels = (root: number, scale: ScaleId): string[] => [
  ...Array.from({ length: DEGREES }, (_, row) => degreeName(root, scale, DEGREES - 1 - row)),
  ...ROW_LABELS.bass,
];

/**
 * SYNTH grid captions: the ten notes of its two octaves with their octave number
 * (highest on top), then DUR.
 */
export const synthRowLabels = (root: number, scale: ScaleId): string[] => [
  ...Array.from({ length: SYNTH_STEPS }, (_, row) => {
    const midi = synthMidi(root, scale, SYNTH_STEPS - 1 - row);
    return `${ROOTS[midi % 12]}${Math.floor(midi / 12) - 1}`;
  }),
  ...ROW_LABELS.synth,
];

export const SYNTH_MODE_LABELS: Readonly<Record<SynthMode, string>> = {
  arp: 'ARPEGIO',
  chords: 'ACORDES',
  melody: 'MELODÍA',
  ambient: 'AMBIENTE',
};

export const SYNTH_PRESET_LABELS: Readonly<Record<SynthPreset, string>> = {
  pluck: 'PLUCK',
  pad: 'PAD',
  stab: 'STAB',
  glass: 'GLASS',
};

export const SCALE_LABELS: Readonly<Record<ScaleId, string>> = {
  pentaMinor: 'PENTA MENOR',
  minor: 'MENOR',
  major: 'MAYOR',
  dorian: 'DÓRICA',
};

export const BASS_MODE_LABELS: Readonly<Record<BassMode, string>> = {
  pulse: 'PULSE',
  broken: 'BROKEN',
  dirty: 'DIRTY',
  drone: 'DRONE',
  chaos: 'CHAOS',
};

/** Headers of knob groups (NODE_SPECS[id].sections). */
export const SECTION_LABELS: Readonly<Record<string, string>> = {
  kick: 'KCK',
  snare: 'SNR',
  hat: 'HAT',
  perc: 'PRC',
};

/** Order of the DRUM kit keys (kit ids). Kits the manifest adds later go after these. */
export const KIT_ORDER: readonly string[] = [
  'samples808',
  'freaksamples',
  'glitch',
  'trip',
  'acid',
  'house',
  'lab',
  'linnrock',
];

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
  editTempo: 'Tempo: tocá para escribirlo',
  tempoInput: 'Tempo en BPM',
  playStop: 'Reproducir o detener',
  patternSection: 'PATRÓN',
  rndm: 'RNDM',
  rndmHint: 'Patrón nuevo al azar',
  kitSection: 'KIT',
  kitHint: 'Kit',
  clickSection: 'CLICK',
  click: 'CLICK',
  clickHint: 'Metrónomo: prender o apagar',
  clickVolume: 'VOL',
  oscSection: 'OSC',
  waves: { saw: 'SIERRA', square: 'CUADRADA' },
  waveHint: 'Forma de onda: sierra o cuadrada',
  sub: 'SUB',
  subHint: 'Sub: una octava más abajo',
  keySection: 'ESCALA',
  root: 'TÓNICA',
  rootDown: 'Bajar la tónica',
  rootUp: 'Subir la tónica',
  scale: 'ESCALA',
  scaleDown: 'Escala anterior',
  scaleUp: 'Escala siguiente',
  modeSection: 'MODO',
  modeHint: 'Modo',
  dice: 'DICE',
  diceHint: 'Patrón nuevo al azar en este modo',
  soundSection: 'SONIDO',
  soundHint: 'Sonido',
  cableHint: 'Cortar o reconectar el cable',
  missing: 'FALTA',
  audioBlocked: 'AUDIO BLOQUEADO · TOCÁ ▶',
  audioUnavailable: 'SIN AUDIO EN ESTE NAVEGADOR',
} as const;
