import { SEQUENCED_IDS, type NodeId, type SequencedId } from './nodes';
import { hasHitAt, type Pattern } from './patterns';

/** A node lighting up for a moment. */
export interface Pulse {
  readonly id: NodeId;
  readonly ms: number;
}

/**
 * Which nodes light up on a step. Stand-in for stage 1: once there is audio,
 * activity comes from the events the engine actually plays.
 */
export function pulsesAt(
  step: number,
  patterns: Readonly<Record<SequencedId, Pattern>>,
): Pulse[] {
  const pulses: Pulse[] = [];
  for (const id of SEQUENCED_IDS) {
    if (hasHitAt(patterns[id], step)) pulses.push({ id, ms: 170 });
  }
  if (step % 4 === 0) {
    pulses.push({ id: 'dist', ms: 520 }, { id: 'drone', ms: 520 }, { id: 'master', ms: 220 });
  }
  if (step % 2 === 0) pulses.push({ id: 'lfo', ms: 200 });
  return pulses;
}
