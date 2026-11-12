import type { NodeId } from '../../core/nodes';

/** Sixteen-point gear: alternating outer (31) and inner (22) radius. */
const gear = (): string => {
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const radius = i % 2 ? 22 : 31;
    const angle = (i / 16) * Math.PI * 2;
    const x = (Math.cos(angle) * radius).toFixed(1);
    const y = (Math.sin(angle) * radius).toFixed(1);
    points.push(`${i ? 'L' : 'M'}${x} ${y}`);
  }
  return `${points.join(' ')}Z`;
};

/** Outline of each node type, centred on the origin. */
export const SHAPES: Readonly<Record<NodeId, string>> = {
  master: 'M0 -34 L32 24 L-32 24Z',
  synth: 'M-26 0a26 26 0 1 0 52 0a26 26 0 1 0 -52 0',
  drum: 'M-24 -24H24V24H-24Z',
  bass: gear(),
  drone: 'M-34 10 L-26 -6 L-15 -1 L-8 -17 L4 -6 L15 -15 L26 -2 L35 10 L20 18 L-20 18Z',
  dist: 'M6 -32 L-16 4 L-2 4 L-8 32 L18 -8 L2 -8Z',
  lfo: 'M-34 0 L-22 -15 L-10 15 L2 -15 L14 15 L26 -15 L34 0',
  lead: 'M-14 -26 L14 -26 L30 0 L14 26 L-14 26 L-30 0Z',
};
