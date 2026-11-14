import { clamp01 } from './geometry';
import { STEPS } from './patterns';
import { createRng, streamSeed } from './random';

/**
 * BASS in SLICE mode: one bar of a loop from public/samples/bass is cut into 16 equal
 * pieces, and a 16-step pattern says which piece plays on each step. Pure TypeScript:
 * the manifest, the cut points, the pattern and its generation, and the sequencer that
 * turns steps into pieces. No DOM, no Web Audio.
 */

export const SLICES = STEPS;

/** The loop folders (sets of the manifest) SLICE can pick from, in panel order. */
export const SLICE_CATEGORIES = ['line', 'line-fx', 'arp', 'sweep', 'sweep-fx'] as const;
export type SliceCategory = (typeof SLICE_CATEGORIES)[number];

export const isSliceCategory = (value: unknown): value is SliceCategory =>
  typeof value === 'string' && (SLICE_CATEGORIES as readonly string[]).includes(value);

/** One loop of the manifest (docs/SAMPLES-BASS.md): a WAV of `bars` bars at `bpm`. */
export interface BassLoop {
  readonly set: SliceCategory;
  readonly file: string;
  readonly variant: string;
  readonly bars: number;
  readonly bpm: number;
  /** Tonic letter, A … G. */
  readonly key: string;
}

/** What the state keeps of a loop: where it is. The rest comes from the manifest. */
export interface SliceLoopRef {
  readonly set: SliceCategory;
  readonly file: string;
}

export const loopId = (loop: SliceLoopRef): string => `${loop.set}/${loop.file}`;
export const sameLoop = (a: SliceLoopRef, b: SliceLoopRef): boolean => a.set === b.set && a.file === b.file;

/** The loop SLICE starts on: a one-bar line in C, variant A. */
export const DEFAULT_LOOP: SliceLoopRef = { set: 'line', file: 'a-128-c.wav' };

const LOOP_FILE = /^[a-z0-9]+(-[a-z0-9]+)*\.wav$/;

/**
 * Reads public/samples/bass/manifest.json: the loops of the five SLICE sets, in manifest
 * order. Sets SLICE does not use (`note`) are skipped. Throws naming the first problem.
 */
export function parseBassManifest(value: unknown): BassLoop[] {
  if (typeof value !== 'object' || value === null) throw new Error('manifest is not an object');
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) throw new Error('manifest version must be 1');
  if (!Array.isArray(raw.sets)) throw new Error('manifest has no sets');
  const loops: BassLoop[] = [];
  for (const entry of raw.sets as unknown[]) {
    const set = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    if (!isSliceCategory(set.id)) continue;
    if (!Array.isArray(set.files)) throw new Error(`set ${set.id}: files must be a list`);
    for (const item of set.files as unknown[]) {
      const file = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      if (typeof file.file !== 'string' || !LOOP_FILE.test(file.file)) {
        throw new Error(`set ${set.id}: invalid file name ${String(file.file)}`);
      }
      const bars = file.bars;
      const bpm = file.bpm;
      if (!Number.isInteger(bars) || (bars as number) < 1) throw new Error(`${set.id}/${file.file}: invalid bars`);
      if (typeof bpm !== 'number' || !(bpm > 0)) throw new Error(`${set.id}/${file.file}: invalid bpm`);
      loops.push({
        set: set.id,
        file: file.file,
        variant: typeof file.variant === 'string' ? file.variant : '',
        bars: bars as number,
        bpm,
        key: typeof file.key === 'string' ? file.key : '',
      });
    }
  }
  return loops;
}

/** The loops of one set, in manifest order. */
export const loopsIn = (loops: readonly BassLoop[], set: SliceCategory): BassLoop[] =>
  loops.filter((loop) => loop.set === set);

export const findLoop = (loops: readonly BassLoop[], ref: SliceLoopRef): BassLoop | null =>
  loops.find((loop) => sameLoop(loop, ref)) ?? null;

// Cut points ------------------------------------------------------------------------------------

/** One bar of 4/4 at a tempo, seconds. */
export const barSeconds = (bpm: number): number => 240 / bpm;
/** One of the 16 pieces of a bar, seconds. */
export const sliceSeconds = (bpm: number): number => barSeconds(bpm) / SLICES;

/** A stretch of the loop, in seconds of the file. */
export interface SliceWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * Where piece `slice` (0..15) of bar `bar` (0-based) sits in the loop, from its tempo
 * and bar count (never from the file's duration). A bar past the end clamps to the last.
 */
export function sliceWindow(loop: { bpm: number; bars: number }, bar: number, slice: number): SliceWindow {
  const b = Math.min(Math.max(0, Math.floor(bar)), loop.bars - 1);
  const s = Math.min(Math.max(0, Math.floor(slice)), SLICES - 1);
  const start = b * barSeconds(loop.bpm) + s * sliceSeconds(loop.bpm);
  return { start, end: start + sliceSeconds(loop.bpm) };
}

/** BAR: a bar of the loop (0-based), or AUTO: the next bar every time the pattern wraps. */
export type SliceBar = number | 'auto';
export const SLICE_BAR_AUTO: SliceBar = 'auto';
export const MAX_LOOP_BARS = 4;

/** The bar that plays on pattern cycle `cycle` (0 = the first), within the loop's bars. */
export function loopBar(bar: SliceBar, cycle: number, bars: number): number {
  const count = Math.max(1, bars);
  if (bar === 'auto') return ((cycle % count) + count) % count;
  return Math.min(Math.max(0, bar), count - 1);
}

// Knobs ------------------------------------------------------------------------------------------

/** SLICE knobs, by param id (in state.params.bass), in panel order. */
export const SLICE_PARAMS = ['sliceVolume', 'sliceFilter', 'sliceDrive', 'slicePitch', 'sliceGate'] as const;
export type SliceParam = (typeof SLICE_PARAMS)[number];

/** PITCH knob: whole semitones, −12 at 0, 0 at the centre, +12 at 1. */
export const pitchSemitones = (knob: number): number => Math.round((clamp01(knob) - 0.5) * 24);

/**
 * Playback speed of the pieces. With SYNC the loop follows the master's tempo like a
 * record (pitch and speed together); without it, natural speed. PITCH on top.
 */
export const sliceRate = (sync: boolean, masterBpm: number, loopBpm: number, pitchKnob: number): number =>
  (sync ? masterBpm / loopBpm : 1) * 2 ** (pitchSemitones(pitchKnob) / 12);

/** GATE knob: how much of each piece sounds, 10 % … all of it. */
export const GATE_MIN = 0.1;
export const gateFraction = (knob: number): number => GATE_MIN + (1 - GATE_MIN) * clamp01(knob);

/** VOLUMEN knob: a gain with a natural taper. */
export const sliceGain = (knob: number): number => clamp01(knob) ** 1.5;

/** FILTRO knob: resonant low-pass, 40 Hz … ~16 kHz (open at 1), sharper as it closes. */
export const FILTER_MIN_HZ = 40;
export const FILTER_OCTAVES = 8.6;
export const sliceFilterHz = (knob: number): number => FILTER_MIN_HZ * 2 ** (clamp01(knob) * FILTER_OCTAVES);
export const sliceFilterQ = (knob: number): number => 0.707 + (1 - clamp01(knob)) * 6;

/** DRIVE knob: gain into a tanh curve, and the gain after it that keeps full scale at 1. */
export function sliceDrive(knob: number): { pre: number; post: number } {
  const pre = 0.2 + clamp01(knob) * 5.8;
  return { pre, post: 1 / Math.tanh(pre) };
}

// Pattern ----------------------------------------------------------------------------------------

export interface SliceStep {
  readonly on: boolean;
  /** Which of the 16 pieces plays, 0..15. */
  readonly slice: number;
  /** The piece plays backwards. */
  readonly reverse: boolean;
}

export type SlicePattern = readonly SliceStep[];

/** Step N plays piece N, every step on: the original loop, whole. */
export const DEFAULT_SLICE_PATTERN: SlicePattern = Array.from({ length: STEPS }, (_, step) => ({
  on: true,
  slice: step,
  reverse: false,
}));

/** Every step off (BORRAR); the pieces stay assigned. */
export const EMPTY_SLICE_PATTERN: SlicePattern = DEFAULT_SLICE_PATTERN.map((step) => ({ ...step, on: false }));

/**
 * A tap on a step with a piece picked on the wave: puts that piece on the step; tapping
 * a step that already plays that piece switches it off.
 */
export function assignSlice(pattern: SlicePattern, step: number, slice: number): SlicePattern {
  const current = pattern[step];
  if (!current || !Number.isInteger(slice) || slice < 0 || slice >= SLICES) return pattern;
  const next: SliceStep =
    current.on && current.slice === slice ? { ...current, on: false } : { ...current, on: true, slice };
  return pattern.map((s, i) => (i === step ? next : s));
}

/** Whether two patterns would show the same on the grid (steps, pieces, reversed). */
export const sameSlicePattern = (a: SlicePattern, b: SlicePattern): boolean =>
  a.length === b.length &&
  a.every((step, i) => step.on === b[i]?.on && step.slice === b[i]?.slice && step.reverse === b[i]?.reverse);

/** Pieces that play on each step, or -1 where the step is off. For the panel. */
export const slicesOf = (pattern: SlicePattern): number[] => pattern.map((step) => (step.on ? step.slice : -1));

// Generation ------------------------------------------------------------------------------------

export const SLICE_DICE_MODES = ['original', 'shuffle', 'stutter', 'chaos'] as const;
export type SliceDiceMode = (typeof SLICE_DICE_MODES)[number];

const randomSlice = (random: () => number): number => Math.floor(random() * SLICES);

/**
 * A pattern from a DICE mode, a seed and CAOS (0..1). The same three values always
 * give the same pattern, and it is never the original loop untouched. CAOS raises the
 * chance of repeating, skipping and reversing pieces in every mode.
 *
 * ORIGINAL: the loop's order with a few changes. SHUFFLE: the pieces reordered.
 * STUTTER: pieces repeated two to four times. CHAOS: anything, anywhere.
 */
export function generateSlicePattern(mode: SliceDiceMode, seed: number, chaos: number): SlicePattern {
  const random = createRng(streamSeed(seed, `slice:${mode}`));
  const amount = clamp01(chaos);
  const steps: SliceStep[] = DEFAULT_SLICE_PATTERN.map((step) => ({ ...step }));

  switch (mode) {
    case 'original': {
      const changed: number[] = [];
      for (let i = 0; i < STEPS; i++) {
        if (random() >= 0.08 + amount * 0.35) continue;
        changed.push(i);
        steps[i] = tweak(steps, i, random, amount);
      }
      // Always at least one change: the original is what the loop plays without DICE.
      if (changed.length === 0) {
        const i = 1 + Math.floor(random() * (STEPS - 1));
        steps[i] = tweak(steps, i, random, amount);
      }
      break;
    }
    case 'shuffle': {
      const order = Array.from({ length: STEPS }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      if (order.every((slice, i) => slice === i)) [order[0], order[1]] = [order[1]!, order[0]!];
      for (let i = 0; i < STEPS; i++) {
        steps[i] = {
          slice: order[i]!,
          on: random() >= amount * 0.2,
          reverse: random() < amount * 0.25,
        };
      }
      break;
    }
    case 'stutter': {
      let i = 0;
      while (i < STEPS) {
        const source = random() < amount * 0.5 ? randomSlice(random) : i;
        const repeats = [2, 2, 3, 4, 1][Math.floor(random() * (amount > 0.5 ? 4 : 5))]!;
        for (let k = 0; k < repeats && i < STEPS; k++, i++) {
          steps[i] = { on: random() >= amount * 0.15, slice: source, reverse: random() < amount * 0.2 };
        }
      }
      if (sameSlicePattern(steps, DEFAULT_SLICE_PATTERN)) steps[1] = { on: true, slice: 0, reverse: false };
      break;
    }
    case 'chaos': {
      for (let i = 0; i < STEPS; i++) {
        steps[i] = {
          on: random() >= 0.12 + amount * 0.25,
          slice: randomSlice(random),
          reverse: random() < 0.15 + amount * 0.35,
        };
      }
      if (sameSlicePattern(steps, DEFAULT_SLICE_PATTERN)) steps[0] = { ...steps[0]!, reverse: true };
      break;
    }
  }
  return steps;
}

/** One change to a step of the original order: repeat the previous piece, skip, reverse or jump. */
function tweak(steps: readonly SliceStep[], i: number, random: () => number, amount: number): SliceStep {
  const step = steps[i]!;
  const roll = random();
  if (roll < 0.35) return { ...step, slice: steps[(i + STEPS - 1) % STEPS]!.slice, on: true };
  if (roll < 0.6) return { ...step, on: false };
  if (roll < 0.85 || amount < 0.3) return { ...step, reverse: true, on: true };
  return { ...step, slice: randomSlice(random), on: true };
}

// Sequencing ------------------------------------------------------------------------------------

/** A piece to play, at audio times (seconds). */
export interface SliceEvent {
  readonly time: number;
  /** Length of the step, seconds. */
  readonly duration: number;
  readonly slice: number;
  /** Which bar of the loop the piece comes from, 0-based. */
  readonly bar: number;
  readonly reverse: boolean;
}

/**
 * Turns pattern steps into pieces, one step at a time, as the clock hands them out. It
 * counts the pattern's cycles so AUTO can move to the next bar of the loop each time
 * the pattern wraps around.
 */
export class SliceSequencer {
  private cycle = -1;
  private bar = 0;

  /**
   * The piece for one step, or null for a silent step. `bars` is the loop's bar count;
   * `reverse` is the REVERSE key, combined with the step's own mark.
   */
  step(
    pattern: SlicePattern,
    index: number,
    bars: number,
    bar: SliceBar,
    reverse: boolean,
    time: number,
    duration: number,
  ): SliceEvent | null {
    if (index % STEPS === 0) this.cycle++;
    this.bar = loopBar(bar, Math.max(0, this.cycle), bars);
    const step = pattern[index % STEPS];
    if (!step?.on) return null;
    return { time, duration, slice: step.slice, bar: this.bar, reverse: reverse !== step.reverse };
  }

  /** The bar of the loop the last step came from (what the panel shows under AUTO). */
  get currentBar(): number {
    return this.bar;
  }

  /** Forgets the cycle count (stop, cable cut, mode change): AUTO starts over at the first bar. */
  reset(): void {
    this.cycle = -1;
    this.bar = 0;
  }
}
