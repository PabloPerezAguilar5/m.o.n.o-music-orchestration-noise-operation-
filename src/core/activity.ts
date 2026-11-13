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
 * SYNTH): they light up from that. LEAD and DRONE are played live and stay lit while
 * they sound (state/live.ts). DISTORSION lights with what goes through it and the LFO
 * glows with its wave (both drawn by the canvas). MASTER keeps its beat.
 */
export function pulsesAt(step: number, sounding: readonly NodeId[]): Pulse[] {
  const pulses: Pulse[] = sounding.map((id) => ({ id, ms: HIT_PULSE_MS }));
  if (step % 4 === 0) pulses.push({ id: 'master', ms: 220 });
  return pulses;
}
