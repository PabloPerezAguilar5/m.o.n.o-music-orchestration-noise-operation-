import { MAX_PATCH_BYTES, PATCH_VERSION, PatchError, patchJson, type Patch } from './patch';

/**
 * A patch in a link: `#p=<version>.<data>`. The data is the patch's JSON, deflated
 * (deflate-raw) and in base64url. Where the browser cannot compress, the data is the
 * JSON itself in base64url and the version carries an `r` (raw): `#p=1r.<data>`.
 * Pure TypeScript: CompressionStream, TextEncoder and btoa are web globals (Node has
 * them too), no DOM.
 */

export const LINK_PREFIX = '#p=';
/** A link longer than this is refused: too long for most chats; EXPORT is the way then. */
export const MAX_LINK_LENGTH = 6000;

/** Most characters of link data decoding will look at (64 KB). */
export const MAX_LINK_INPUT = 64 * 1024;

export type LinkFormat = 'deflate' | 'raw';

export interface PatchLink {
  /** The hash, from `#`. */
  readonly hash: string;
  readonly format: LinkFormat;
  readonly length: number;
}

/** Whether this runtime can deflate and inflate. */
export const canCompress = (): boolean =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function pipe(bytes: Uint8Array, stream: ReadableWritablePair<Uint8Array, BufferSource>): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(source).arrayBuffer());
}

export const deflate = (bytes: Uint8Array): Promise<Uint8Array> => pipe(bytes, new CompressionStream('deflate-raw'));

/**
 * Inflates reading the stream in chunks. As soon as the output passes `maxBytes` it
 * cancels the stream and throws PatchError('too-big'): a compression bomb never
 * gets to sit whole in memory.
 */
export async function inflate(bytes: Uint8Array, maxBytes: number = MAX_PATCH_BYTES): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PatchError('too-big');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(textValue: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(textValue)) throw new PatchError('json', 'base64url');
  const base64 = textValue.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new PatchError('json', 'base64url');
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Builds the link's hash for a patch. Never refuses on length: the caller checks `length`. */
export async function encodePatchLink(patch: Patch): Promise<PatchLink> {
  const bytes = new TextEncoder().encode(patchJson(patch));
  const format: LinkFormat = canCompress() ? 'deflate' : 'raw';
  const data = toBase64Url(format === 'deflate' ? await deflate(bytes) : bytes);
  const hash = `${LINK_PREFIX}${PATCH_VERSION}${format === 'raw' ? 'r' : ''}.${data}`;
  return { hash, format, length: hash.length };
}

/** Whether a hash (or a whole URL) carries a patch. */
export const hasPatchLink = (hashOrUrl: string): boolean => hashOrUrl.includes(LINK_PREFIX);

/**
 * Reads the patch's JSON value out of a link's hash (or a whole URL). The result is
 * raw: it still has to go through migration and the validator. Anything off throws a
 * PatchError.
 */
export async function decodePatchLink(hashOrUrl: string): Promise<unknown> {
  const start = hashOrUrl.indexOf(LINK_PREFIX);
  if (start < 0) throw new PatchError('json', 'no link');
  const payload = hashOrUrl.slice(start + LINK_PREFIX.length).split('&')[0] ?? '';
  const dot = payload.indexOf('.');
  if (dot <= 0) throw new PatchError('json', 'link format');
  const token = payload.slice(0, dot);
  const data = payload.slice(dot + 1);
  const match = /^(\d{1,3})(r?)$/.exec(token);
  if (!match) throw new PatchError('json', 'link format');
  const version = Number(match[1]);
  if (version < 1 || version > PATCH_VERSION) throw new PatchError('version', String(version));
  // Input cap, in characters. Real links are under MAX_LINK_LENGTH; this is only a
  // generous bound. It does NOT bound the inflated size: inflate() does that itself.
  if (data.length > MAX_LINK_INPUT) throw new PatchError('too-big');
  let bytes = fromBase64Url(data);
  if (match[2] !== 'r') {
    if (!canCompress()) throw new PatchError('json', 'no DecompressionStream');
    try {
      bytes = await inflate(bytes, MAX_PATCH_BYTES);
    } catch (error) {
      if (error instanceof PatchError) throw error;
      throw new PatchError('json', 'inflate');
    }
  }
  if (bytes.length > MAX_PATCH_BYTES) throw new PatchError('too-big');
  const json = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new PatchError('json');
  }
}
