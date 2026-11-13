import { MOD_TARGETS } from '../core/lfo';

/**
 * How the LFO's cable lands on each module. The LFO sends its wave times CANTIDAD (-1..1);
 * a module asked for `inputFor(MOD_SOURCE)` hands back a gain that turns that into its own
 * units, at the span of MOD_TARGETS, into the parameter it moves.
 */

/** Graph id of the LFO module: cables from it are modulation. */
export const MOD_SOURCE = 'lfo';

/** Span of a node's main knob, knob units each way at CANTIDAD 1. */
export const modSpan = (id: keyof typeof MOD_TARGETS): number => MOD_TARGETS[id]?.span ?? 0;

/**
 * DRONE: cents of filter per LFO unit. One knob unit of FILTRO is 0.4 of the brightness,
 * and the brightness spans 8 octaves (drone-sound.ts).
 */
export const DRONE_FILTER_CENTS = 0.4 * 8 * 1200 * modSpan('drone');

/** DRUM: cents of pitch per LFO unit. TONO spans 24 semitones (toneRate). */
export const DRUM_TONE_CENTS = 24 * 100 * modSpan('drum');
