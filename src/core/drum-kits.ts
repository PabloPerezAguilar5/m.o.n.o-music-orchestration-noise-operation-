import { DRUM_ROWS, type DrumRow } from './nodes';
import { createRng, streamSeed } from './random';

/** public/samples/drums/manifest.json, described in docs/SAMPLES.md. */

export interface DrumKitFile {
  readonly file: string;
  /** DRUM row this file plays on, or null if it is not used by any row. */
  readonly row: DrumRow | null;
}

export interface DrumKitEntry {
  /** Folder name, also the kit id. */
  readonly id: string;
  readonly files: readonly DrumKitFile[];
}

export interface DrumManifest {
  readonly version: 1;
  readonly kits: readonly DrumKitEntry[];
}

const FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.wav$/;
const KIT_ID = /^[a-z0-9][a-z0-9-]*$/;

const isRow = (value: unknown): value is DrumRow =>
  typeof value === 'string' && (DRUM_ROWS as readonly string[]).includes(value);

/** Validates the manifest. Throws an Error naming the first problem found. */
export function parseDrumManifest(value: unknown): DrumManifest {
  if (typeof value !== 'object' || value === null) throw new Error('manifest is not an object');
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) throw new Error('manifest version must be 1');
  if (!Array.isArray(raw.kits) || raw.kits.length === 0) throw new Error('manifest has no kits');

  const ids = new Set<string>();
  const kits = raw.kits.map((entry: unknown, index): DrumKitEntry => {
    const kit = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const id = kit.id;
    if (typeof id !== 'string' || !KIT_ID.test(id) || ids.has(id)) {
      throw new Error(`kit ${index}: missing, invalid or repeated id`);
    }
    ids.add(id);
    if (!Array.isArray(kit.files)) throw new Error(`kit ${id}: files must be a list`);
    const names = new Set<string>();
    const files = kit.files.map((item: unknown): DrumKitFile => {
      const file = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      if (typeof file.file !== 'string' || !FILE_NAME.test(file.file) || names.has(file.file)) {
        throw new Error(`kit ${id}: invalid or repeated file name ${String(file.file)}`);
      }
      names.add(file.file);
      if (file.row !== null && !isRow(file.row)) {
        throw new Error(`kit ${id}: ${file.file} has an unknown row ${String(file.row)}`);
      }
      return { file: file.file, row: file.row };
    });
    return { id, files };
  });
  return { version: 1, kits };
}

/** Files of a kit that play on a row, in manifest order. */
export const filesForRow = (kit: DrumKitEntry, row: DrumRow): string[] =>
  kit.files.filter((entry) => entry.row === row).map((entry) => entry.file);

/**
 * Which variant of a row plays on a step. Fixed per (seed, row, step), so a pattern
 * always sounds the same at the same position.
 */
export function pickVariant(seed: number, row: DrumRow, step: number, count: number): number {
  if (count <= 1) return 0;
  return Math.floor(createRng(streamSeed(seed, `variant:${row}:${step}`))() * count);
}

/** Short kit name for the display: "samples808" → "808". */
export const kitLabel = (id: string): string => id.replace(/samples/g, '').toUpperCase() || id.toUpperCase();
