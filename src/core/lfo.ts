import { clamp01 } from './geometry';
import { DRUM_ROWS, drumToneParam, type NodeId } from './nodes';

/**
 * LFO: shapes, speed (free in Hz, or SYNC in divisions of the master's tempo) and what
 * its modulation cable moves on each node. Pure TypeScript: the worklet runs the wave,
 * the UI draws it and the knobs show where it is.
 */

export const LFO_SHAPES = ['sine', 'triangle', 'square', 'random'] as const;
export type LfoShape = (typeof LFO_SHAPES)[number];

/** SYNC divisions, slowest first: one cycle per whole note … per sixteenth. */
export const LFO_DIVISIONS = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 16] as const;
export const LFO_DIVISION_LABELS = ['1/1', '1/2', '1/4', '1/8', '1/16'] as const;

/** How many times a second the running wave is sampled for the display and the knob rings. */
export const LFO_TRACE_RATE = 500;

/** Free speed range, Hz (VELOCIDAD at 0 and at 1, exponential in between). */
export const LFO_MIN_HZ = 0.05;
export const LFO_MAX_HZ = 20;

/** VELOCIDAD without SYNC: 0.05 … 20 Hz. */
export const lfoFreeRate = (knob: number): number => LFO_MIN_HZ * (LFO_MAX_HZ / LFO_MIN_HZ) ** clamp01(knob);

/** VELOCIDAD with SYNC: which division (index into LFO_DIVISIONS), in five equal zones. */
export const lfoDivisionIndex = (knob: number): number =>
  Math.min(LFO_DIVISIONS.length - 1, Math.floor(clamp01(knob) * LFO_DIVISIONS.length));

/** Cycles per second of a division at a tempo: a whole note is four beats. */
export const lfoSyncRate = (bpm: number, division: number): number => bpm / 60 / (4 * division);

/** Cycles per second for the knob, SYNC and tempo. */
export const lfoRate = (knob: number, sync: boolean, bpm: number): number =>
  sync ? lfoSyncRate(bpm, LFO_DIVISIONS[lfoDivisionIndex(knob)]!) : lfoFreeRate(knob);

/** What VELOCIDAD reads on the display: "1/4" with SYNC, else "2.5 Hz". */
export function lfoRateLabel(knob: number, sync: boolean): string {
  if (sync) return LFO_DIVISION_LABELS[lfoDivisionIndex(knob)]!;
  const hz = lfoFreeRate(knob);
  return `${hz < 1 ? hz.toFixed(2) : hz < 10 ? hz.toFixed(1) : hz.toFixed(0)} Hz`;
}

/**
 * The wave at a phase (0..1), from -1 to 1. Square and random are steps here; the worklet
 * smooths every edge (lfo-dsp.ts). Random holds `held`, picked once per cycle.
 */
export function lfoWave(shape: LfoShape, phase: number, held = 0): number {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'sine':
      return Math.sin(p * Math.PI * 2);
    case 'triangle':
      return p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : p * 4 - 4;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'random':
      return held;
  }
}

// What the LFO moves --------------------------------------------------------------------------

/**
 * The main knob of each node the LFO can move, and how far it moves it at CANTIDAD 1, in
 * knob units each way (0.5: from the knob's value, half the knob's travel up and down).
 * DRUM moves its four TONO knobs together.
 */
export interface ModTarget {
  readonly params: readonly string[];
  readonly span: number;
}

export const MOD_TARGETS: Readonly<Partial<Record<NodeId, ModTarget>>> = {
  synth: { params: ['cutoff'], span: 0.5 },
  bass: { params: ['cutoff'], span: 0.5 },
  lead: { params: ['cutoff'], span: 0.5 },
  drone: { params: ['filter'], span: 0.5 },
  dist: { params: ['drive'], span: 0.5 },
  drum: { params: DRUM_ROWS.map(drumToneParam), span: 0.25 },
};

/** Where a moved knob is: its value plus the LFO's (-1..1) times CANTIDAD and the span. */
export const modulatedValue = (base: number, lfo: number, depth: number, span: number): number =>
  clamp01(base + lfo * clamp01(depth) * span);
