import { BASS_MODES, type BassMode, type BassPattern, type BassStep } from './bass-patterns';
import { DEFAULT_KIT } from './drum-kits';
import { DRONE_MODES, DRONE_PRESETS, type DroneMode, type DronePreset } from './drone';
import { type DrumPattern } from './drum-patterns';
import { MAX_HITS_PER_STEP, MAX_OFFSET, type Hit } from './generators';
import { clamp, clamp01, clampNodePosition, type Point } from './geometry';
import { clampLeadOctave } from './lead';
import { LFO_SHAPES, type LfoShape } from './lfo';
import { DIST_TYPES, DRUM_ROWS, MACRO_PARAM, NODE_IDS, NODE_SPECS, type DistType, type NodeId } from './nodes';
import { STEPS } from './patterns';
import { cableKind, createsLoop, sameCable, type Cable } from './routing';
import { DEGREES, ROOTS, SCALE_IDS, SYNTH_STEPS, type ScaleId } from './scales';
import {
  DEFAULT_LOOP,
  isSliceCategory,
  MAX_LOOP_BARS,
  sameLoop,
  SLICE_DICE_MODES,
  SLICE_PARAMS,
  SLICES,
  type SliceBar,
  type SliceCategory,
  type SliceDiceMode,
  type SliceLoopRef,
  type SlicePattern,
  type SliceStep,
} from './slice';
import { SYNTH_LENGTHS, SYNTH_MAX_NOTES, SYNTH_MODES, type SynthMode, type SynthPattern, type SynthStep } from './synth-patterns';
import { SYNTH_PRESETS, type SynthPreset } from './synth-voices';
import { clampBpm } from './transport';

/**
 * A patch: the whole canvas as plain data, to be saved, shared and loaded. Nothing
 * transient (whether it plays, the playhead, live notes). Pure TypeScript: the schema,
 * a strict validator for patches from strangers, and the migration between versions.
 */

export const PATCH_VERSION = 1;
/** A patch bigger than this (its JSON text, bytes) is refused before it is parsed. */
export const MAX_PATCH_BYTES = 200 * 1024;
export const MAX_PATCH_NAME = 40;
/** Longest text accepted anywhere in a patch (dates, ids). */
const MAX_TEXT = 80;
/** Longest list accepted anywhere in a patch before the rest is dropped. */
const MAX_LIST = 64;
/** Length of a file name of a loop or an id of a kit. */
const ASSET_ID = /^[a-z0-9][a-z0-9.-]{0,39}$/;

export interface DrumPatch {
  readonly kit: string;
  readonly seed: number;
  readonly pattern: DrumPattern;
}

export interface SlicePatch {
  readonly category: SliceCategory;
  readonly loop: SliceLoopRef;
  readonly bar: SliceBar;
  readonly sync: boolean;
  readonly reverse: boolean;
  readonly mode: SliceDiceMode;
  readonly seed: number;
  readonly pattern: SlicePattern;
}

export interface BassPatch {
  readonly voice: 'synth' | 'slice';
  readonly seed: number;
  readonly mode: BassMode;
  readonly pattern: BassPattern;
  readonly wave: 'saw' | 'square';
  readonly sub: boolean;
  readonly slides: boolean;
  readonly slice: SlicePatch;
}

export interface SynthPatch {
  readonly seed: number;
  readonly mode: SynthMode;
  readonly preset: SynthPreset;
  readonly pattern: SynthPattern;
}

export interface Patch {
  readonly v: typeof PATCH_VERSION;
  readonly name: string;
  /** ISO 8601, when it was saved. */
  readonly date: string;
  readonly bpm: number;
  readonly key: { readonly root: number; readonly scale: ScaleId };
  /** Nodes on the canvas, MASTER first. */
  readonly nodes: readonly NodeId[];
  readonly positions: Readonly<Partial<Record<NodeId, Point>>>;
  /** Knob values 0..1 by node and param; a missing knob keeps its default. */
  readonly params: Readonly<Partial<Record<NodeId, Readonly<Record<string, number>>>>>;
  readonly cables: readonly Cable[];
  readonly drum: DrumPatch;
  readonly bass: BassPatch;
  readonly synth: SynthPatch;
  readonly lead: { readonly octave: number; readonly scaleLock: boolean; readonly hold: boolean };
  readonly drone: { readonly preset: DronePreset; readonly mode: DroneMode };
  readonly distType: DistType;
  readonly lfo: { readonly shape: LfoShape; readonly sync: boolean };
  readonly metronome: { readonly on: boolean; readonly volume: number };
}

// Errors and warnings ---------------------------------------------------------------------------

export type PatchErrorCode =
  /** Not JSON, or not an object. */
  | 'json'
  | 'not-object'
  /** Bigger than MAX_PATCH_BYTES. */
  | 'too-big'
  /** A version this app does not know (newer, or missing). */
  | 'version'
  /** A field of the wrong type, named in `detail`. */
  | 'field';

export class PatchError extends Error {
  constructor(
    readonly code: PatchErrorCode,
    readonly detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PatchError';
  }
}

/** Something the patch asked for that this app does not have; a default took its place. */
export interface PatchWarning {
  readonly kind: 'kit' | 'loop';
  readonly wanted: string;
}

/** What exists in this app's manifests; null while a manifest has not loaded (anything well-formed is accepted then). */
export interface KnownAssets {
  readonly kits: readonly string[] | null;
  readonly loops: readonly SliceLoopRef[] | null;
}

export const UNKNOWN_ASSETS: KnownAssets = { kits: null, loops: null };

export interface ParsedPatch {
  readonly patch: Patch;
  readonly warnings: readonly PatchWarning[];
}

// Validation ------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;

/** Keys that are never read from a patch, whatever it says. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isRecord = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A field of an object, read only if it is the object's own and not a forbidden key. */
function field(raw: Raw, key: string): unknown {
  if (FORBIDDEN_KEYS.has(key) || !Object.prototype.hasOwnProperty.call(raw, key)) return undefined;
  return raw[key];
}

const fail = (path: string): never => {
  throw new PatchError('field', path);
};

function record(value: unknown, path: string): Raw {
  if (!isRecord(value)) return fail(path);
  return value;
}

/** A sub-object that may be missing (then empty); present, it must be an object. */
const optionalRecord = (raw: Raw, key: string, path: string): Raw => {
  const value = field(raw, key);
  return value === undefined ? {} : record(value, path);
};

function list(value: unknown, path: string, max = MAX_LIST): unknown[] {
  if (!Array.isArray(value)) return fail(path);
  return value.slice(0, max);
}

function number(value: unknown, path: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path);
  return value;
}

function boolean(value: unknown, path: string, fallback?: boolean): boolean {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') return fail(path);
  return value;
}

/** A short text: control characters dropped, trimmed, cut to `max`. */
function text(value: unknown, path: string, max = MAX_TEXT, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') return fail(path);
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ''))
    .slice(0, max)
    .join('')
    .trim();
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) return fail(path);
  return value as T;
}

const isNodeId = (value: unknown): value is NodeId =>
  typeof value === 'string' && (NODE_IDS as readonly string[]).includes(value);

/** A 32-bit seed. */
const seed = (value: unknown, path: string, fallback: number): number =>
  Math.floor(clamp(number(value, path, fallback), 0, 0xffffffff));

/** `count` steps: what the patch has, cut or padded with `rest`. */
function steps<T>(value: unknown, path: string, count: number, rest: T, parse: (step: unknown, path: string) => T): T[] {
  const items = list(value, path, count);
  return Array.from({ length: count }, (_, i) => (i < items.length ? parse(items[i], `${path}[${i}]`) : rest));
}

/** The knob names of a node (the SLICE knobs on BASS). */
export function knownParams(id: NodeId): readonly string[] {
  const own = NODE_SPECS[id].params;
  return id === 'bass' ? [...own, ...SLICE_PARAMS, MACRO_PARAM] : [...own, MACRO_PARAM];
}

function parseDrumPattern(value: unknown, path: string): DrumPattern {
  const rows = list(value, path, DRUM_ROWS.length);
  return DRUM_ROWS.map((_, row) =>
    steps<readonly Hit[]>(rows[row] ?? [], `${path}[${row}]`, STEPS, [], (step, stepPath) =>
      list(step, stepPath, MAX_HITS_PER_STEP).map((item, i) => {
        const hit = record(item, `${stepPath}[${i}]`);
        return {
          velocity: clamp01(number(field(hit, 'velocity'), `${stepPath}[${i}].velocity`, 0.8)),
          offset: clamp(number(field(hit, 'offset'), `${stepPath}[${i}].offset`, 0), 0, MAX_OFFSET),
        };
      }),
    ),
  );
}

const BASS_REST: BassStep = { note: null, slide: false, accent: false, length: 1 };

function parseBassPattern(value: unknown, path: string): BassPattern {
  return steps(value, path, STEPS, BASS_REST, (item, stepPath) => {
    const step = record(item, stepPath);
    const rawNote = field(step, 'note');
    const note =
      rawNote === null || rawNote === undefined
        ? null
        : Math.round(clamp(number(rawNote, `${stepPath}.note`), 0, DEGREES - 1));
    return {
      note,
      slide: boolean(field(step, 'slide'), `${stepPath}.slide`, false),
      accent: boolean(field(step, 'accent'), `${stepPath}.accent`, false),
      length: Math.round(clamp(number(field(step, 'length'), `${stepPath}.length`, 1), 1, STEPS)),
    };
  });
}

const SYNTH_REST: SynthStep = { notes: [], length: 1 };

function parseSynthPattern(value: unknown, path: string): SynthPattern {
  const lengths = SYNTH_LENGTHS as readonly number[];
  return steps(value, path, STEPS, SYNTH_REST, (item, stepPath) => {
    const step = record(item, stepPath);
    const notes = list(field(step, 'notes') ?? [], `${stepPath}.notes`, SYNTH_MAX_NOTES).map((note, i) =>
      Math.round(clamp(number(note, `${stepPath}.notes[${i}]`), 0, SYNTH_STEPS - 1)),
    );
    const length = Math.round(clamp(number(field(step, 'length'), `${stepPath}.length`, 1), 1, STEPS));
    return {
      notes: [...new Set(notes)].sort((a, b) => a - b),
      length: lengths.includes(length) ? length : 1,
    };
  });
}

function parseSlicePattern(value: unknown, path: string): SlicePattern {
  const items = list(value, path, SLICES);
  return Array.from({ length: SLICES }, (_, i): SliceStep => {
    if (i >= items.length) return { on: false, slice: i, reverse: false };
    const stepPath = `${path}[${i}]`;
    const step = record(items[i], stepPath);
    return {
      on: boolean(field(step, 'on'), `${stepPath}.on`, true),
      slice: Math.round(clamp(number(field(step, 'slice'), `${stepPath}.slice`, i), 0, SLICES - 1)),
      reverse: boolean(field(step, 'reverse'), `${stepPath}.reverse`, false),
    };
  });
}

function parseCables(value: unknown, nodes: readonly NodeId[]): Cable[] {
  const cables: Cable[] = [];
  list(value ?? [], 'cables').forEach((item, i) => {
    const raw = record(item, `cables[${i}]`);
    const from = field(raw, 'from');
    const to = field(raw, 'to');
    // A cable to or from something that is not a node, or not on the canvas, is dropped.
    if (!isNodeId(from) || !isNodeId(to) || !nodes.includes(from) || !nodes.includes(to)) return;
    const kind = cableKind(from, to);
    if (kind !== 'audio' && kind !== 'mod') return;
    if (kind === 'audio' && createsLoop(cables, from, to)) return;
    if (cables.some((cable) => sameCable(cable, { from, to }))) return;
    cables.push({ from, to, cut: boolean(field(raw, 'cut'), `cables[${i}].cut`, false) });
  });
  return cables;
}

function parseSlice(raw: Raw, known: KnownAssets, warnings: PatchWarning[]): SlicePatch {
  let loop: SliceLoopRef = DEFAULT_LOOP;
  const rawLoop = field(raw, 'loop');
  if (rawLoop !== undefined) {
    const record_ = record(rawLoop, 'bass.slice.loop');
    const set = field(record_, 'set');
    const file = text(field(record_, 'file'), 'bass.slice.loop.file');
    if (!isSliceCategory(set)) fail('bass.slice.loop.set');
    else if (!ASSET_ID.test(file)) fail('bass.slice.loop.file');
    else loop = { set, file };
  }
  if (known.loops && !known.loops.some((other) => sameLoop(other, loop))) {
    warnings.push({ kind: 'loop', wanted: `${loop.set}/${loop.file}` });
    loop = DEFAULT_LOOP;
  }
  const rawBar = field(raw, 'bar');
  const bar: SliceBar =
    rawBar === 'auto' ? 'auto' : Math.round(clamp(number(rawBar, 'bass.slice.bar', 0), 0, MAX_LOOP_BARS - 1));
  const rawCategory = field(raw, 'category');
  const category = rawCategory === undefined ? loop.set : isSliceCategory(rawCategory) ? rawCategory : fail('bass.slice.category');
  const pattern = field(raw, 'pattern');
  return {
    category,
    loop,
    bar,
    sync: boolean(field(raw, 'sync'), 'bass.slice.sync', true),
    reverse: boolean(field(raw, 'reverse'), 'bass.slice.reverse', false),
    mode: oneOf(field(raw, 'mode'), SLICE_DICE_MODES, 'bass.slice.mode', 'original'),
    seed: seed(field(raw, 'seed'), 'bass.slice.seed', 0),
    pattern: pattern === undefined ? parseSlicePattern([], 'bass.slice.pattern') : parseSlicePattern(pattern, 'bass.slice.pattern'),
  };
}

/**
 * Checks a patch that may come from anyone and builds a clean copy of it: every value
 * read by name, nothing executed. Wrong types are refused (PatchError), unknown keys
 * are never copied, numbers are clamped, texts and lists are cut. A kit or loop the
 * manifests do not have becomes the default, with a warning.
 */
export function parsePatch(input: unknown, known: KnownAssets = UNKNOWN_ASSETS): ParsedPatch {
  const raw = record(input, 'patch');
  if (field(raw, 'v') !== PATCH_VERSION) throw new PatchError('version', String(field(raw, 'v')));
  const warnings: PatchWarning[] = [];

  // Nodes: known ids only, each once, MASTER first.
  const nodes: NodeId[] = ['master'];
  for (const id of list(field(raw, 'nodes') ?? [], 'nodes', NODE_IDS.length * 2)) {
    if (isNodeId(id) && !nodes.includes(id)) nodes.push(id);
  }

  const positions: Partial<Record<NodeId, Point>> = {};
  const rawPositions = optionalRecord(raw, 'positions', 'positions');
  for (const id of NODE_IDS) {
    const point = field(rawPositions, id);
    if (point === undefined || id === 'master') continue;
    const p = record(point, `positions.${id}`);
    positions[id] = clampNodePosition({
      x: number(field(p, 'x'), `positions.${id}.x`),
      y: number(field(p, 'y'), `positions.${id}.y`),
    });
  }

  const params: Partial<Record<NodeId, Record<string, number>>> = {};
  const rawParams = optionalRecord(raw, 'params', 'params');
  for (const id of NODE_IDS) {
    const own = field(rawParams, id);
    if (own === undefined) continue;
    const values = record(own, `params.${id}`);
    const clean: Record<string, number> = {};
    for (const param of knownParams(id)) {
      const value = field(values, param);
      if (value !== undefined) clean[param] = clamp01(number(value, `params.${id}.${param}`));
    }
    params[id] = clean;
  }

  const rawKey = optionalRecord(raw, 'key', 'key');
  const rawDrum = optionalRecord(raw, 'drum', 'drum');
  const rawBass = optionalRecord(raw, 'bass', 'bass');
  const rawSynth = optionalRecord(raw, 'synth', 'synth');
  const rawLead = optionalRecord(raw, 'lead', 'lead');
  const rawDrone = optionalRecord(raw, 'drone', 'drone');
  const rawLfo = optionalRecord(raw, 'lfo', 'lfo');
  const rawMetronome = optionalRecord(raw, 'metronome', 'metronome');

  let kit = text(field(rawDrum, 'kit'), 'drum.kit', MAX_TEXT, DEFAULT_KIT);
  if (!ASSET_ID.test(kit)) fail('drum.kit');
  if (known.kits && !known.kits.includes(kit)) {
    warnings.push({ kind: 'kit', wanted: kit });
    kit = DEFAULT_KIT;
  }

  const drumPattern = field(rawDrum, 'pattern');
  const bassPattern = field(rawBass, 'pattern');
  const synthPattern = field(rawSynth, 'pattern');

  const patch: Patch = {
    v: PATCH_VERSION,
    name: text(field(raw, 'name'), 'name', MAX_PATCH_NAME, ''),
    date: text(field(raw, 'date'), 'date', MAX_TEXT, ''),
    bpm: clampBpm(Math.round(number(field(raw, 'bpm'), 'bpm', 120))),
    key: {
      root: Math.round(clamp(number(field(rawKey, 'root'), 'key.root', 0), 0, ROOTS.length - 1)),
      scale: oneOf(field(rawKey, 'scale'), SCALE_IDS, 'key.scale', 'pentaMinor'),
    },
    nodes,
    positions,
    params,
    cables: parseCables(field(raw, 'cables'), nodes),
    drum: {
      kit,
      seed: seed(field(rawDrum, 'seed'), 'drum.seed', 0),
      pattern: drumPattern === undefined ? parseDrumPattern([], 'drum.pattern') : parseDrumPattern(drumPattern, 'drum.pattern'),
    },
    bass: {
      voice: oneOf(field(rawBass, 'voice'), ['synth', 'slice'], 'bass.voice', 'synth'),
      seed: seed(field(rawBass, 'seed'), 'bass.seed', 0),
      mode: oneOf(field(rawBass, 'mode'), BASS_MODES, 'bass.mode', 'pulse'),
      pattern: bassPattern === undefined ? parseBassPattern([], 'bass.pattern') : parseBassPattern(bassPattern, 'bass.pattern'),
      wave: oneOf(field(rawBass, 'wave'), ['saw', 'square'], 'bass.wave', 'saw'),
      sub: boolean(field(rawBass, 'sub'), 'bass.sub', false),
      slides: boolean(field(rawBass, 'slides'), 'bass.slides', true),
      slice: parseSlice(optionalRecord(rawBass, 'slice', 'bass.slice'), known, warnings),
    },
    synth: {
      seed: seed(field(rawSynth, 'seed'), 'synth.seed', 0),
      mode: oneOf(field(rawSynth, 'mode'), SYNTH_MODES, 'synth.mode', 'chords'),
      preset: oneOf(field(rawSynth, 'preset'), SYNTH_PRESETS, 'synth.preset', 'pluck'),
      pattern:
        synthPattern === undefined ? parseSynthPattern([], 'synth.pattern') : parseSynthPattern(synthPattern, 'synth.pattern'),
    },
    lead: {
      octave: clampLeadOctave(Math.round(number(field(rawLead, 'octave'), 'lead.octave', 0))),
      scaleLock: boolean(field(rawLead, 'scaleLock'), 'lead.scaleLock', false),
      hold: boolean(field(rawLead, 'hold'), 'lead.hold', false),
    },
    drone: {
      preset: oneOf(field(rawDrone, 'preset'), DRONE_PRESETS, 'drone.preset', 'drone'),
      mode: oneOf(field(rawDrone, 'mode'), DRONE_MODES, 'drone.mode', 'touch'),
    },
    distType: oneOf(field(raw, 'distType'), DIST_TYPES, 'distType', 'soft'),
    lfo: {
      shape: oneOf(field(rawLfo, 'shape'), LFO_SHAPES, 'lfo.shape', 'sine'),
      sync: boolean(field(rawLfo, 'sync'), 'lfo.sync', false),
    },
    metronome: {
      on: boolean(field(rawMetronome, 'on'), 'metronome.on', false),
      volume: clamp01(number(field(rawMetronome, 'volume'), 'metronome.volume', 0.7)),
    },
  };
  return { patch, warnings };
}

/** Bytes of a text as UTF-8. */
export const byteLength = (textValue: string): number => new TextEncoder().encode(textValue).length;

/**
 * Reads a patch from its JSON text: size limit first, then JSON, then migration to the
 * current version, then the validator.
 */
export function parsePatchText(json: string, known: KnownAssets = UNKNOWN_ASSETS): ParsedPatch {
  if (byteLength(json) > MAX_PATCH_BYTES) throw new PatchError('too-big');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new PatchError('json');
  }
  return parsePatch(migratePatch(value), known);
}

// Migration -------------------------------------------------------------------------------------

/** Turns a patch of version n into one of version n + 1 (it must set `v`). */
export type PatchMigration = (patch: Raw) => Raw;

/** Migrations by the version they start from. Empty: there is only version 1 so far. */
export const MIGRATIONS: Readonly<Record<number, PatchMigration>> = {};

/**
 * Brings a patch of an older version up to PATCH_VERSION, one step at a time. A patch
 * without a version, or from a newer app, is refused.
 */
export function migratePatch(
  raw: unknown,
  migrations: Readonly<Record<number, PatchMigration>> = MIGRATIONS,
  target: number = PATCH_VERSION,
): unknown {
  if (!isRecord(raw)) throw new PatchError('not-object');
  let current = raw;
  let version = field(current, 'v');
  if (!Number.isInteger(version) || (version as number) < 1) throw new PatchError('version', String(version));
  while ((version as number) < target) {
    const step = migrations[version as number];
    if (!step) throw new PatchError('version', String(version));
    current = step(current);
    const next = field(current, 'v');
    if (next !== (version as number) + 1) throw new PatchError('version', `migration from ${String(version)}`);
    version = next;
  }
  if (version !== target) throw new PatchError('version', String(version));
  return current;
}

/** Bytes 0..255 of a patch's JSON text: what the link and the file carry. */
export const patchJson = (patch: Patch): string => JSON.stringify(patch);

/** The file name of an exported patch: its name, safe for a file system, plus `.mono`. */
export function patchFileName(patch: Patch): string {
  const base = patch.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_PATCH_NAME);
  return `${base || 'patch'}.mono`;
}
