import type { BassMode } from '../core/bass-patterns';
import type { DroneMode, DronePreset } from '../core/drone';
import { DEGREES, degreeName, ROOTS, SYNTH_STEPS, synthMidi, type ScaleId } from '../core/scales';
import type { BassLoop, SliceCategory, SliceDiceMode, SliceParam } from '../core/slice';
import type { BassVoice } from '../state/types';
import type { SynthMode } from '../core/synth-patterns';
import type { SynthPreset } from '../core/synth-voices';
import type { LfoShape } from '../core/lfo';
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
  master: ['SYNTH', 'DRUM', 'BASS', 'DRONE', 'LEAD', 'ESPACIO', 'VOL'],
  synth: ['ONDA', 'CUTOFF', 'RESO', 'ATAQUE', 'RELEASE', 'DETUNE'],
  drum: ['TONO', 'VOL', 'TONO', 'VOL', 'TONO', 'VOL', 'TONO', 'VOL'],
  bass: ['CUTOFF', 'RESO', 'DECAY', 'DRIVE'],
  drone: ['FILTRO', 'ATAQUE', 'RELEASE', 'DESAF.', 'VOL'],
  dist: ['DRIVE', 'TONO', 'MEZCLA', 'SALIDA'],
  lfo: ['VELOCIDAD', 'CANTIDAD'],
  lead: ['ONDA', 'CUTOFF', 'RESO', 'ATAQUE', 'RELEASE', 'GLIDE'],
};

/**
 * Sequencer row captions, in the same order as NODE_SPECS[id].rows. BASS names its
 * five note rows after the key (bassRowLabels); these are its last two.
 */
export const ROW_LABELS: Readonly<Record<NodeId, readonly string[]>> = {
  master: [],
  synth: ['DURACIÓN'],
  drum: ['KCK', 'SNR', 'HAT', 'PRC'],
  bass: ['SLIDE', 'ACCENT'],
  drone: [],
  dist: [],
  lfo: [],
  lead: [],
};

/** BASS grid captions: the five notes of the key (highest on top), then SLIDE and ACCENT. */
export const bassRowLabels = (root: number, scale: ScaleId): string[] => [
  ...Array.from({ length: DEGREES }, (_, row) => degreeName(root, scale, DEGREES - 1 - row)),
  ...ROW_LABELS.bass,
];

/**
 * SYNTH grid captions: the ten notes of its two octaves with their octave number
 * (highest on top), then DURACIÓN.
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

export const DRONE_PRESET_LABELS: Readonly<Record<DronePreset, string>> = {
  drone: 'DRONE',
  pad: 'PAD',
  glass: 'GLASS',
  noise: 'NOISE',
  alien: 'ALIEN',
};

export const DRONE_MODE_LABELS: Readonly<Record<DroneMode, string>> = {
  touch: 'TOUCH',
  hold: 'HOLD',
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

/** BASS voices: the 303 or pieces of a loop. */
export const BASS_VOICE_LABELS: Readonly<Record<BassVoice, string>> = {
  synth: 'SYNTH',
  slice: 'SLICE',
};

/** SLICE knob captions, by param id. */
export const SLICE_KNOB_LABELS: Readonly<Record<SliceParam, string>> = {
  sliceVolume: 'VOLUMEN',
  sliceFilter: 'FILTRO',
  sliceDrive: 'DRIVE',
  slicePitch: 'PITCH',
  sliceGate: 'GATE',
};

/** The loop folders of public/samples/bass, as the panel names them. */
export const SLICE_CATEGORY_LABELS: Readonly<Record<SliceCategory, string>> = {
  line: 'LINE',
  'line-fx': 'LINE FX',
  arp: 'ARP',
  sweep: 'SWEEP',
  'sweep-fx': 'SWEEP FX',
};

export const SLICE_MODE_LABELS: Readonly<Record<SliceDiceMode, string>> = {
  original: 'ORIGINAL',
  shuffle: 'SHUFFLE',
  stutter: 'STUTTER',
  chaos: 'CHAOS',
};

/** A loop in the list and on the display: its variant and tonic, "A · C". */
export const loopLabel = (loop: BassLoop): string => `${loop.variant.toUpperCase()} · ${loop.key}`;

/** PITCH on the display: whole semitones with their sign, "+3", "0", "−12". */
export const pitchLabel = (semitones: number): string =>
  semitones > 0 ? `+${semitones}` : semitones < 0 ? `−${-semitones}` : '0';

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

export const LFO_SHAPE_LABELS: Readonly<Record<LfoShape, string>> = {
  sine: 'SENO',
  triangle: 'TRIÁNGULO',
  square: 'CUADRADA',
  random: 'RANDOM',
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
  clear: 'BORRAR',
  clearHint: 'Borrar el patrón: todos los pasos en blanco',
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
  slides: 'SLIDE',
  slidesHint: 'Slide: prender o apagar todos, sin borrar los marcados',
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
  portHint: 'Salida: arrastrá hasta otro nodo para conectar',
  cableLoop: 'Esa conexión crearía un bucle',
  cableNoInput: 'no tiene entrada',
  cableLfoMaster: 'El LFO no modula el MASTER',
  shapeSection: 'FORMA',
  syncSection: 'SYNC',
  sync: 'SYNC',
  syncHint: 'Sync: la velocidad en divisiones del tempo del MASTER',
  typeSection: 'TIPO',
  keyboardSection: 'TECLADO',
  octave: 'OCT',
  octaveDown: 'Bajar una octava',
  octaveUp: 'Subir una octava',
  scaleLock: 'SCALE LOCK',
  scaleLockHint: 'Scale lock: cada tecla toca la nota más cercana de la escala',
  leadHold: 'HOLD',
  leadHoldHint: 'Hold: la última nota tocada sigue sonando al soltar la tecla',
  layersSection: 'CAPAS',
  layersStop: 'STOP',
  layersStopHint: 'Apagar todas las capas con su release',
  clearLayers: 'CLEAR',
  clearLayersHint: 'Silenciar todo ya, colas de efecto incluidas',
  padNote: 'NOTA',
  padMotion: 'FILTRO · MOVIMIENTO',
  missing: 'FALTA',
  voiceSection: 'VOZ',
  voiceHint: 'Voz',
  loopHint: 'Loop',
  categoryHint: 'Categoría',
  loopPreviewHint: 'Loop (tocá para escuchar)',
  bar: 'BAR',
  barHint: 'Compás del loop del que salen los pedazos',
  barAuto: 'AUTO',
  barAutoHint: 'AUTO: avanza un compás cada vuelta del patrón',
  sliceSync: 'SYNC',
  sliceSyncHint: 'Sync: el loop sigue el tempo del MASTER, el tono acompaña',
  reverse: 'REVERSE',
  reverseHint: 'Reverse: todos los pedazos al revés',
  waveRow: 'ONDA',
  stepRow: 'PASO',
  sliceHint: 'Pedazo',
  stepHint: 'Paso',
  loading: 'CARGANDO',
  loadError: 'ERROR',
  noLoops: 'SIN LOOPS',
  audioBlocked: 'AUDIO BLOQUEADO · TOCÁ ▶',
  audioUnavailable: 'SIN AUDIO EN ESTE NAVEGADOR',
} as const;
