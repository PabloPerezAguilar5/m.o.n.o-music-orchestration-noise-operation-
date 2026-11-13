import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { SampleLibrary } from '../../src/audio/sample-library';
import { filesForRow, kitLabel, parseDrumManifest, pickVariant } from '../../src/core/drum-kits';

const MANIFEST_PATH = fileURLToPath(new URL('../../public/samples/drums/manifest.json', import.meta.url));
const realManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as unknown;

describe('parseDrumManifest', () => {
  it('accepts the real manifest', () => {
    const manifest = parseDrumManifest(realManifest);
    expect(manifest.kits.map((kit) => kit.id)).toEqual([
      '909samples',
      'freaksamples',
      'glitch',
      'samples808',
      'trip',
    ]);
    const kit909 = manifest.kits[0]!;
    expect(filesForRow(kit909, 'kick')).toEqual(['kick-1.wav', 'kick-2.wav', 'kick-3.wav']);
    expect(filesForRow(kit909, 'perc')).toEqual(['clap.wav']);
  });

  it.each([
    [null, /not an object/],
    [{ version: 2, kits: [] }, /version/],
    [{ version: 1, kits: [] }, /no kits/],
    [{ version: 1, kits: [{ id: 'A B', files: [] }] }, /id/],
    [{ version: 1, kits: [{ id: 'a', files: [] }, { id: 'a', files: [] }] }, /id/],
    [{ version: 1, kits: [{ id: 'a', files: [{ file: 'Kick 1.wav', row: 'kick' }] }] }, /file name/],
    [{ version: 1, kits: [{ id: 'a', files: [{ file: 'kick.wav', row: 'tom' }] }] }, /unknown row/],
  ])('rejects %j', (value, message) => {
    expect(() => parseDrumManifest(value)).toThrow(message);
  });
});

describe('pickVariant', () => {
  it('is fixed per seed, row and step, and inside the range', () => {
    for (let step = 0; step < 16; step++) {
      const variant = pickVariant(7, 'hat', step, 3);
      expect(variant).toBe(pickVariant(7, 'hat', step, 3));
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(3);
    }
    expect(pickVariant(7, 'hat', 0, 1)).toBe(0);
    expect(pickVariant(7, 'hat', 0, 0)).toBe(0);
  });

  it('uses every variant across a bar', () => {
    const used = new Set(Array.from({ length: 16 }, (_, step) => pickVariant(11, 'kick', step, 3)));
    expect(used.size).toBe(3);
  });
});

it('kitLabel shortens kit ids for the display', () => {
  expect(kitLabel('909samples')).toBe('909');
  expect(kitLabel('samples808')).toBe('808');
  expect(kitLabel('glitch')).toBe('GLITCH');
});

describe('SampleLibrary', () => {
  const manifest = {
    version: 1,
    kits: [
      {
        id: 'kit',
        files: [
          { file: 'kick.wav', row: 'kick' },
          { file: 'kick-2.wav', row: 'kick' },
          { file: 'snare.wav', row: 'snare' },
          { file: 'hat.wav', row: 'hat' },
          { file: 'perc.wav', row: 'perc' },
          { file: 'ride.wav', row: null },
        ],
      },
    ],
  };

  /** Serves the manifest and WAVs from a table; `broken` files get a 404 or an HTML page. */
  const library = (options: { broken?: Record<string, 404 | 'html'>; noManifest?: boolean } = {}) => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const path = String(url).replace('/samples/drums/', '');
      if (path === 'manifest.json') {
        return options.noManifest
          ? new Response('', { status: 404 })
          : new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } });
      }
      const file = decodeURIComponent(path.split('/').pop()!);
      const broken = options.broken?.[file];
      if (broken === 404) return new Response('', { status: 404 });
      if (broken === 'html') return new Response('<html>', { headers: { 'content-type': 'text/html' } });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } });
    });
    const decode = vi.fn(async () => ({ duration: 1 }) as AudioBuffer);
    return { lib: new SampleLibrary(decode, '/samples/drums/', fetcher as typeof fetch), fetcher, decode };
  };

  it('loads every file of a row as a variant, and skips files without a row', async () => {
    const { lib, decode } = library();
    const kit = await lib.loadKit('kit');
    expect(kit.failed).toEqual([]);
    expect(kit.rows.kick).toHaveLength(2);
    expect(kit.rows.snare).toHaveLength(1);
    expect(decode).toHaveBeenCalledTimes(5);
  });

  it('reports failed files and leaves their row empty (fallback voice) without throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { lib } = library({ broken: { 'snare.wav': 404, 'kick-2.wav': 'html' } });
    const kit = await lib.loadKit('kit');
    expect([...kit.failed].sort()).toEqual(['kick-2.wav', 'snare.wav']);
    expect(kit.rows.snare).toEqual([]);
    expect(kit.rows.kick).toHaveLength(1);
  });

  it('a missing manifest is a failure of the kit, not a crash', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { lib } = library({ noManifest: true });
    const kit = await lib.loadKit('kit');
    expect(kit.failed).toEqual(['manifest.json']);
    await expect(lib.loadManifest()).rejects.toThrow(/404/);
  });

  it('an unknown kit is reported, not thrown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { lib } = library();
    expect((await lib.loadKit('nope')).failed).toEqual(['manifest.json']);
  });

  it('loads each kit once', async () => {
    const { lib, fetcher } = library();
    await Promise.all([lib.loadKit('kit'), lib.loadKit('kit')]);
    await lib.loadKit('kit');
    expect(fetcher).toHaveBeenCalledTimes(6); // manifest + 5 files
  });
});
