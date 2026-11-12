import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * public/samples/drums/manifest.json must describe the sample folders exactly:
 * every listed file exists, every WAV is listed, names follow the convention
 * and every kit can play every DRUM row.
 */

const DRUMS = fileURLToPath(new URL('../../public/samples/drums/', import.meta.url));
const ROWS = ['kick', 'snare', 'hat', 'perc'];
/** Lowercase words joined by hyphens: kick-1.wav, open-hat.wav. */
const FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.wav$/;

interface Manifest {
  version: number;
  rows: string[];
  kits: { id: string; files: { file: string; row: string | null }[] }[];
}

const manifest = JSON.parse(readFileSync(path.join(DRUMS, 'manifest.json'), 'utf8')) as Manifest;
const kitFolders = readdirSync(DRUMS)
  .filter((entry) => statSync(path.join(DRUMS, entry)).isDirectory())
  .sort();

describe('drum samples manifest', () => {
  it('declares version 1 and the four DRUM rows', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.rows).toEqual(ROWS);
  });

  it('lists every kit folder once', () => {
    const ids = manifest.kits.map((kit) => kit.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(kitFolders);
  });

  for (const kit of manifest.kits) {
    describe(kit.id, () => {
      const listed = kit.files.map((entry) => entry.file);

      it('lists exactly the WAV files in its folder', () => {
        const onDisk = readdirSync(path.join(DRUMS, kit.id)).sort();
        expect(new Set(listed).size).toBe(listed.length);
        expect([...listed].sort()).toEqual(onDisk);
      });

      it('uses simple file names', () => {
        for (const file of listed) expect(file, file).toMatch(FILE_NAME);
      });

      it('assigns each file to a known row or to none', () => {
        for (const { file, row } of kit.files) {
          expect(row === null || ROWS.includes(row), `${file}: ${row}`).toBe(true);
        }
      });

      it('has at least one file for every row', () => {
        for (const row of ROWS) {
          expect(kit.files.some((entry) => entry.row === row), row).toBe(true);
        }
      });
    });
  }

  it('uses clap for PRC in 909samples and woodblock in samples808', () => {
    const perc = (id: string) =>
      manifest.kits
        .find((kit) => kit.id === id)
        ?.files.filter((entry) => entry.row === 'perc')
        .map((entry) => entry.file);
    expect(perc('909samples')).toEqual(['clap.wav']);
    expect(perc('samples808')).toEqual(['woodblock.wav']);
  });
});
