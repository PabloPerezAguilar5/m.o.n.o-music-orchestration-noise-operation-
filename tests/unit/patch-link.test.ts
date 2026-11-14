import { describe, expect, it } from 'vitest';
import { parsePatch, PatchError, patchJson } from '../../src/core/patch';
import {
  canCompress,
  decodePatchLink,
  encodePatchLink,
  fromBase64Url,
  hasPatchLink,
  LINK_PREFIX,
  MAX_LINK_LENGTH,
  toBase64Url,
} from '../../src/core/patch-link';
import { patchFromState } from '../../src/state/patch-state';
import { Store } from '../../src/state/store';

const DATE = '2026-11-14T12:00:00.000Z';

function patch() {
  const store = new Store();
  for (const id of ['drum', 'bass', 'synth', 'dist', 'lfo'] as const) store.addNode(id);
  store.connect('bass', 'dist');
  store.setBpm(140);
  store.randomize(() => 7);
  store.randomizeBass(() => 9);
  return patchFromState(store.getState(), 'Compartido', DATE);
}

describe('patch links', () => {
  it('this runtime can deflate', () => {
    expect(canCompress()).toBe(true);
  });

  it('base64url goes there and back, without padding or URL-unsafe characters', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256);
    const text = toBase64Url(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(text)).toEqual(bytes);
    expect(() => fromBase64Url('a+b/c=')).toThrow(PatchError);
  });

  it('encodes as #p=1.<deflate-raw, base64url> and decodes to the same patch', async () => {
    const original = patch();
    const link = await encodePatchLink(original);
    expect(link.format).toBe('deflate');
    expect(link.hash.startsWith(`${LINK_PREFIX}1.`)).toBe(true);
    expect(link.hash).toMatch(/^#p=1\.[A-Za-z0-9_-]+$/);
    expect(link.length).toBe(link.hash.length);
    // Smaller than the JSON it carries.
    expect(link.length).toBeLessThan(patchJson(original).length);
    const raw = await decodePatchLink(link.hash);
    expect(raw).toEqual(JSON.parse(patchJson(original)));
    expect(parsePatch(raw).patch).toEqual(original);
  });

  it('reads the link out of a whole URL and ignores what follows', async () => {
    const link = await encodePatchLink(patch());
    const url = `https://example.test/app/${link.hash}&utm=1`;
    expect(hasPatchLink(url)).toBe(true);
    expect(hasPatchLink('https://example.test/#other')).toBe(false);
    expect(await decodePatchLink(url)).toEqual(await decodePatchLink(link.hash));
  });

  it('accepts the uncompressed format, marked with r', async () => {
    const original = patch();
    const hash = `${LINK_PREFIX}1r.${toBase64Url(new TextEncoder().encode(patchJson(original)))}`;
    expect(await decodePatchLink(hash)).toEqual(JSON.parse(patchJson(original)));
  });

  it('a usual patch fits in a link well under the limit', async () => {
    const link = await encodePatchLink(patch());
    expect(link.length).toBeLessThan(MAX_LINK_LENGTH);
  });

  it('refuses broken links with a PatchError, never with anything else', async () => {
    const codes = async (hash: string): Promise<string> => {
      try {
        await decodePatchLink(hash);
        return 'ok';
      } catch (error) {
        return error instanceof PatchError ? error.code : 'other';
      }
    };
    expect(await codes('#x=1.abc')).toBe('json');
    expect(await codes('#p=')).toBe('json');
    expect(await codes('#p=1')).toBe('json');
    expect(await codes('#p=uno.abc')).toBe('json');
    expect(await codes('#p=9.abc')).toBe('version');
    expect(await codes('#p=1.esto no es base64')).toBe('json');
    expect(await codes('#p=1.AAAAAAAAAAAA')).toBe('json'); // not deflate
    expect(await codes(`#p=1r.${toBase64Url(new TextEncoder().encode('{"v":1,'))}`)).toBe('json');
    expect(await codes(`#p=1.${'A'.repeat(500_000)}`)).toBe('too-big');
  });
});
