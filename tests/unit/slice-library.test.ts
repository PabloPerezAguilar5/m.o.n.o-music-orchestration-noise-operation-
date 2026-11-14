import { describe, expect, it, vi } from 'vitest';
import { SliceLibrary } from '../../src/audio/bass/slice-library';
import type { BassLoop } from '../../src/core/slice';

/**
 * Lazy loading of the bass loops: nothing is fetched or decoded until a loop is asked
 * for, each loop is decoded once, and a small cache keeps the last ones used.
 */

const MANIFEST = {
  version: 1,
  types: ['note', 'phrase', 'arp'],
  sets: [
    {
      id: 'line',
      type: 'phrase',
      files: [
        { file: 'a-128-a.wav', variant: 'a', bars: 1, bpm: 128, key: 'A' },
        { file: 'a-128-b.wav', variant: 'a', bars: 1, bpm: 128, key: 'B' },
        { file: 'a-128-c.wav', variant: 'a', bars: 1, bpm: 128, key: 'C' },
      ],
    },
    { id: 'arp', type: 'arp', files: [{ file: 'a-128-a.wav', variant: 'a', bars: 4, bpm: 128, key: 'A' }] },
    { id: 'note', type: 'note', files: [] },
  ],
};

const loop = (set: 'line' | 'arp', file: string): BassLoop => ({ set, file, variant: 'a', bars: 1, bpm: 128, key: 'A' });

/** A server with the manifest and WAV-ish files (their name as bytes); `missing` 404s. */
function server(missing: string[] = []) {
  const requests: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = decodeURIComponent(url.replace('/samples/bass/', ''));
    requests.push(path);
    if (missing.includes(path)) return new Response(null, { status: 404 });
    if (path === 'manifest.json') return new Response(JSON.stringify(MANIFEST), { headers: { 'content-type': 'application/json' } });
    return new Response(new TextEncoder().encode(path), { headers: { 'content-type': 'audio/wav' } });
  }) as unknown as typeof fetch;
  const decoded: string[] = [];
  const decode = vi.fn(async (bytes: ArrayBuffer) => {
    const name = new TextDecoder().decode(bytes);
    decoded.push(name);
    return { name } as unknown as AudioBuffer;
  });
  return { fetcher, decode, requests, decoded };
}

describe('SliceLibrary', () => {
  it('reads the manifest (SLICE sets only) and fetches nothing else by itself', async () => {
    const { fetcher, decode, requests } = server();
    const library = new SliceLibrary(decode, '/samples/bass/', fetcher);
    const loops = await library.loadManifest();
    expect(loops.map((l) => `${l.set}/${l.file}`)).toEqual(['line/a-128-a.wav', 'line/a-128-b.wav', 'line/a-128-c.wav', 'arp/a-128-a.wav']);
    expect(requests).toEqual(['manifest.json']);
    expect(decode).not.toHaveBeenCalled();
  });

  it('loads only the loop asked for, once; a second request comes from the cache', async () => {
    const { fetcher, decode, requests, decoded } = server();
    const library = new SliceLibrary(decode, '/samples/bass/', fetcher);
    const a = loop('line', 'a-128-c.wav');
    expect(library.get(a)).toBeUndefined();
    const first = await library.load(a);
    expect(decoded).toEqual(['line/a-128-c.wav']);
    expect(requests).toEqual(['line/a-128-c.wav']);
    expect(library.get(a)).toBe(first);
    expect(await library.load(a)).toBe(first);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('two requests for the same loop while it decodes share one fetch', async () => {
    const { fetcher, decode } = server();
    const library = new SliceLibrary(decode, '/samples/bass/', fetcher);
    const a = loop('line', 'a-128-a.wav');
    const [x, y] = await Promise.all([library.load(a), library.load(a)]);
    expect(x).toBe(y);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it('keeps a small cache of the last loops used and drops the oldest', async () => {
    const { fetcher, decode } = server();
    const library = new SliceLibrary(decode, '/samples/bass/', fetcher, 2);
    const a = loop('line', 'a-128-a.wav');
    const b = loop('line', 'a-128-b.wav');
    const c = loop('line', 'a-128-c.wav');
    await library.load(a);
    await library.load(b);
    expect(library.cached()).toEqual(['line/a-128-a.wav', 'line/a-128-b.wav']);
    library.get(a); // a is the one just used: b becomes the oldest
    await library.load(c);
    expect(library.cached()).toEqual(['line/a-128-a.wav', 'line/a-128-c.wav']);
    expect(library.has(b)).toBe(false);
    await library.load(b); // decoded again
    expect(decode).toHaveBeenCalledTimes(4);
    expect(library.cached()).toEqual(['line/a-128-c.wav', 'line/a-128-b.wav']);
  });

  it('a loop that fails rejects, is not cached, and the next request retries it', async () => {
    const { fetcher, decode, requests } = server(['line/a-128-b.wav']);
    const library = new SliceLibrary(decode, '/samples/bass/', fetcher);
    const b = loop('line', 'a-128-b.wav');
    await expect(library.load(b)).rejects.toThrow(/HTTP 404/);
    expect(library.has(b)).toBe(false);
    await expect(library.load(b)).rejects.toThrow();
    expect(requests.filter((path) => path === 'line/a-128-b.wav')).toHaveLength(2);
    // Other loops are unaffected.
    await expect(library.load(loop('line', 'a-128-a.wav'))).resolves.toBeDefined();
  });

  it('a page served instead of the file counts as a failure', async () => {
    const fetcher = (async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    const library = new SliceLibrary(vi.fn(), '/samples/bass/', fetcher);
    await expect(library.load(loop('line', 'a-128-a.wav'))).rejects.toThrow(/HTML/);
    await expect(library.loadManifest()).rejects.toThrow(/HTML/);
  });

  it('a manifest that fails is retried on the next call', async () => {
    const { fetcher, decode, requests } = server(['manifest.json']);
    const library = new SliceLibrary(decode, '/samples/bass/', fetcher);
    await expect(library.loadManifest()).rejects.toThrow();
    await expect(library.loadManifest()).rejects.toThrow();
    expect(requests).toEqual(['manifest.json', 'manifest.json']);
  });
});
