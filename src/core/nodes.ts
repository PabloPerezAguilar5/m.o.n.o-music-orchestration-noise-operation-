/** Node types of the instrument. At most one node of each type exists; MASTER is always present. */
export const NODE_IDS = ['master', 'synth', 'drum', 'bass', 'drone', 'dist', 'lfo', 'lead'] as const;
export type NodeId = (typeof NODE_IDS)[number];

export type InstrumentId = Exclude<NodeId, 'master'>;
export const INSTRUMENT_IDS: readonly InstrumentId[] = NODE_IDS.filter(
  (id): id is InstrumentId => id !== 'master',
);

/** Nodes driven by a 16-step pattern. */
export const SEQUENCED_IDS = ['synth', 'drum', 'bass'] as const;
export type SequencedId = (typeof SEQUENCED_IDS)[number];
export const isSequenced = (id: NodeId): id is SequencedId =>
  (SEQUENCED_IDS as readonly NodeId[]).includes(id);

export const DIST_TYPES = ['soft', 'hard', 'crush'] as const;
export type DistType = (typeof DIST_TYPES)[number];

/** The performance surface a node shows below its knobs. */
export type ZoneKind = 'tempo' | 'sequencer' | 'xy' | 'type' | 'wave' | 'keys';

/** Macro knob present on every node. On DRUM it sets how chaotic the generated pattern is. */
export const MACRO_PARAM = 'chaos';

/** DRUM rows, top to bottom. Also the row names used by the sample manifest. */
export const DRUM_ROWS = ['kick', 'snare', 'hat', 'perc'] as const;
export type DrumRow = (typeof DRUM_ROWS)[number];

/** DRUM knob ids for one row. */
export const drumToneParam = (row: DrumRow): string => `${row}Tone`;
export const drumVolumeParam = (row: DrumRow): string => `${row}Volume`;

/** A group of knobs under one header in the panel. */
export interface ParamSection {
  readonly id: string;
  readonly params: readonly string[];
}

export interface NodeSpec {
  /** Continuous parameters (0..1), in panel order. */
  readonly params: readonly string[];
  /** Knob groups; when absent, all params sit in one group named after the node. */
  readonly sections?: readonly ParamSection[];
  readonly zone: ZoneKind;
  /** Pattern rows, for sequenced nodes. */
  readonly rows: readonly string[];
}

const DRUM_SECTIONS: readonly ParamSection[] = DRUM_ROWS.map((row) => ({
  id: row,
  params: [drumToneParam(row), drumVolumeParam(row)],
}));

export const NODE_SPECS: Readonly<Record<NodeId, NodeSpec>> = {
  master: {
    params: ['synthLevel', 'drumLevel', 'bassLevel', 'droneLevel', 'space', 'volume'],
    zone: 'tempo',
    rows: [],
  },
  synth: {
    params: ['wave', 'cutoff', 'resonance', 'attack', 'release', 'detune'],
    zone: 'sequencer',
    // Ten scale steps over two octaves (highest on top), then the length: see synth-patterns.ts.
    rows: [...Array.from({ length: 10 }, (_, i) => `step${9 - i}`), 'length'],
  },
  drum: {
    params: DRUM_SECTIONS.flatMap((section) => section.params),
    sections: DRUM_SECTIONS,
    zone: 'sequencer',
    rows: DRUM_ROWS,
  },
  bass: {
    params: ['cutoff', 'resonance', 'decay', 'drive'],
    zone: 'sequencer',
    // Five scale degrees (highest on top), then slide and accent: see bass-patterns.ts.
    rows: ['degree4', 'degree3', 'degree2', 'degree1', 'degree0', 'slide', 'accent'],
  },
  drone: { params: ['tone', 'detune', 'filter', 'volume'], zone: 'xy', rows: [] },
  dist: { params: ['drive', 'tone', 'mix'], zone: 'type', rows: [] },
  lfo: { params: ['shape', 'rate', 'depth'], zone: 'wave', rows: [] },
  lead: {
    params: ['wave', 'cutoff', 'resonance', 'attack', 'release', 'detune'],
    zone: 'keys',
    rows: [],
  },
};
