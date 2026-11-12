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

/** Macro knob present on every node. */
export const MACRO_PARAM = 'chaos';

export interface NodeSpec {
  /** Continuous parameters (0..1), in panel order. */
  readonly params: readonly string[];
  readonly zone: ZoneKind;
  /** Pattern rows, for sequenced nodes. */
  readonly rows: readonly string[];
}

export const NODE_SPECS: Readonly<Record<NodeId, NodeSpec>> = {
  master: {
    params: ['synthLevel', 'drumLevel', 'bassLevel', 'droneLevel', 'space', 'volume'],
    zone: 'tempo',
    rows: [],
  },
  synth: {
    params: ['wave', 'cutoff', 'resonance', 'attack', 'release', 'detune'],
    zone: 'sequencer',
    rows: ['note', 'octave', 'accent'],
  },
  drum: {
    params: ['tone', 'decay', 'volume', 'swing'],
    zone: 'sequencer',
    rows: ['kick', 'snare', 'hat', 'perc'],
  },
  bass: {
    params: ['cutoff', 'resonance', 'decay', 'drive'],
    zone: 'sequencer',
    rows: ['note', 'slide', 'accent'],
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
