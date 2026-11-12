import type { NodeId } from '../core/nodes';

/** Neon colour of each node type. */
export const NODE_COLORS: Readonly<Record<NodeId, string>> = {
  master: '#EDEDF7',
  synth: '#00FFB3',
  drum: '#FF007A',
  bass: '#A700FF',
  drone: '#FF4500',
  dist: '#FFEA00',
  lfo: '#CFCFE6',
  lead: '#00E5FF',
};
