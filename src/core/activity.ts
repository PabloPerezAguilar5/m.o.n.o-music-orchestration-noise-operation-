import type { GridPatternId, NodeId } from './nodes';
import { hasHitAt, type Pattern } from './patterns';

/** A node lighting up for a moment. */
export interface Pulse {
  readonly id: NodeId;
  readonly ms: number;
}

/** How long a node stays lit after it sounds. */
export const HIT_PULSE_MS = 170;

/**
 * Which nodes light up on a step.
 *
 * `sounding` are the nodes the audio engine really played on this step (DRUM, for now):
 * they light up from that. The other nodes do not make sound yet, so until their own
 * stage they keep the stage 1 simulation: SYNTH and BASS on their pattern, DISTORSION,
 * DRONE and MASTER on each beat, LFO every other step.
 */
export function pulsesAt(
  step: number,
  patterns: Readonly<Record<GridPatternId, Pattern>>,
  sounding: readonly NodeId[],
): Pulse[] {
  const pulses: Pulse[] = sounding.map((id) => ({ id, ms: HIT_PULSE_MS }));
  if (hasHitAt(patterns.synth, step)) pulses.push({ id: 'synth', ms: HIT_PULSE_MS });
  if (hasHitAt(patterns.bass, step)) pulses.push({ id: 'bass', ms: HIT_PULSE_MS });
  if (step % 4 === 0) {
    pulses.push({ id: 'dist', ms: 520 }, { id: 'drone', ms: 520 }, { id: 'master', ms: 220 });
  }
  if (step % 2 === 0) pulses.push({ id: 'lfo', ms: 200 });
  return pulses;
}
