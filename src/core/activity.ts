import type { NodeId } from './nodes';

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
 * `sounding` are the nodes the audio engine really played on this step (DRUM, BASS and
 * SYNTH): they light up from that. The other nodes do not make sound yet, so until
 * their own stage they keep the stage 1 simulation: DISTORSION, DRONE and MASTER on each
 * beat, LFO every other step.
 */
export function pulsesAt(step: number, sounding: readonly NodeId[]): Pulse[] {
  const pulses: Pulse[] = sounding.map((id) => ({ id, ms: HIT_PULSE_MS }));
  if (step % 4 === 0) {
    pulses.push({ id: 'dist', ms: 520 }, { id: 'drone', ms: 520 }, { id: 'master', ms: 220 });
  }
  if (step % 2 === 0) pulses.push({ id: 'lfo', ms: 200 });
  return pulses;
}
