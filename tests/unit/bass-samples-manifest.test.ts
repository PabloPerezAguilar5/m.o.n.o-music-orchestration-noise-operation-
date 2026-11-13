import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * public/samples/bass/manifest.json must describe the sample folders exactly
 * (docs/SAMPLES-BASS.md): every listed file exists, every WAV is listed, names
 * follow <variant>-<bpm>-<key>.wav and the musical data matches the name.
 */

const BASS = fileURLToPath(new URL('../../public/samples/bass/', import.meta.url));
const TYPES = ['note', 'phrase', 'arp'];
const SET_TYPES: Record<string, string> = {
  line: 'phrase',
  'line-fx': 'phrase',
  arp: 'arp',
  sweep: 'phrase',
  'sweep-fx': 'phrase',
  note: 'note',
};
/** Loop length in bars, per set. */
const SET_BARS: Record<string, number> = { line: 1, 'line-fx': 1, arp: 4, sweep: 4, 'sweep-fx': 4 };
const LOOP_NAME = /^([a-z]+)-(\d+)-([a-g])\.wav$/;
/** Files that may sit in a folder without being samples. */
const NOT_SAMPLES = new Set(['.gitkeep']);

interface BassFile {
  file: string;
  variant: string;
  bars: number;
  bpm: number;
  key: string;
}
interface Manifest {
  version: number;
  types: string[];
  sets: { id: string; type: string; files: BassFile[] }[];
}

const manifest = JSON.parse(readFileSync(path.join(BASS, 'manifest.json'), 'utf8')) as Manifest;
const folders = readdirSync(BASS)
  .filter((entry) => statSync(path.join(BASS, entry)).isDirectory())
  .sort();

/** Duration of a PCM WAV in seconds, from its fmt and data chunks. */
function wavSeconds(file: string): number {
  const bytes = readFileSync(file);
  let offset = 12;
  let byteRate = 0;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = bytes.readUInt32LE(offset + 16);
    if (id === 'data') dataLength = length;
    offset += 8 + length + (length & 1);
  }
  return dataLength / byteRate;
}

describe('bass samples manifest', () => {
  it('declares version 1 and the three types', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.types).toEqual(TYPES);
  });

  it('has one set per folder, each with its type', () => {
    const ids = manifest.sets.map((set) => set.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(folders);
    for (const set of manifest.sets) expect(set.type, set.id).toBe(SET_TYPES[set.id]);
  });

  it('keeps only 128 BPM loops and no macOS leftovers', () => {
    const everything = folders.flatMap((folder) => readdirSync(path.join(BASS, folder)));
    expect(everything.filter((name) => name === '.DS_Store')).toEqual([]);
    for (const set of manifest.sets) for (const file of set.files) expect(file.bpm, file.file).toBe(128);
  });

  for (const set of manifest.sets) {
    describe(set.id, () => {
      it('lists exactly the WAV files in its folder', () => {
        const listed = set.files.map((entry) => entry.file);
        const onDisk = readdirSync(path.join(BASS, set.id))
          .filter((name) => !NOT_SAMPLES.has(name))
          .sort();
        expect(new Set(listed).size).toBe(listed.length);
        expect([...listed].sort()).toEqual(onDisk);
      });

      it('names each file <variant>-<bpm>-<key>.wav, matching its data', () => {
        for (const entry of set.files) {
          const match = entry.file.match(LOOP_NAME);
          expect(match, entry.file).not.toBeNull();
          const [, variant, bpm, key] = match!;
          expect(entry.variant, entry.file).toBe(variant);
          expect(entry.bpm, entry.file).toBe(Number(bpm));
          expect(entry.key, entry.file).toBe(key!.toUpperCase());
          expect(entry.bars, entry.file).toBe(SET_BARS[set.id]);
        }
      });

      it('lasts exactly its bars at its tempo', () => {
        for (const entry of set.files) {
          const seconds = wavSeconds(path.join(BASS, set.id, entry.file));
          expect(seconds, entry.file).toBeCloseTo((entry.bars * 240) / entry.bpm, 3);
        }
      });
    });
  }

  it('note is empty for now', () => {
    expect(manifest.sets.find((set) => set.id === 'note')?.files).toEqual([]);
  });
});
