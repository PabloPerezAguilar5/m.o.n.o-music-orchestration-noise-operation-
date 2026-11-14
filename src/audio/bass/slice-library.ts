import { loopId, parseBassManifest, type BassLoop, type SliceLoopRef } from '../../core/slice';
import { MANIFEST_FILE, type Decode } from '../sample-library';

/** Where the bass loops are served. */
export const BASS_SAMPLES_BASE = `${import.meta.env.BASE_URL}samples/bass/`;

/** Decoded loops kept at once (the one playing plus the last few heard). ~10 MiB at most. */
export const LOOP_CACHE_SIZE = 4;

/**
 * Loads the bass loop manifest and decodes loops one at a time, only when asked for
 * (lazy): a loop is fetched and decoded the first time it is wanted, then kept in a small
 * most-recently-used cache. Loading a loop that fails rejects, and the next request
 * retries it; the manifest is retried the same way.
 */
export class SliceLibrary {
  private manifest: Promise<BassLoop[]> | null = null;
  private readonly cache = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer>>();

  constructor(
    private readonly decode: Decode,
    private readonly base: string = BASS_SAMPLES_BASE,
    private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
    private readonly capacity: number = LOOP_CACHE_SIZE,
  ) {}

  /** The manifest's loops. Rejects if it cannot be loaded or is invalid; a later call retries. */
  loadManifest(): Promise<BassLoop[]> {
    this.manifest ??= this.fetchBytes(MANIFEST_FILE)
      .then((bytes) => parseBassManifest(JSON.parse(new TextDecoder().decode(bytes))))
      .catch((error: unknown) => {
        this.manifest = null;
        throw error;
      });
    return this.manifest;
  }

  /** A decoded loop if it is in the cache (and marks it as just used). */
  get(loop: SliceLoopRef): AudioBuffer | undefined {
    const id = loopId(loop);
    const buffer = this.cache.get(id);
    if (buffer) {
      this.cache.delete(id);
      this.cache.set(id, buffer);
    }
    return buffer;
  }

  has(loop: SliceLoopRef): boolean {
    return this.cache.has(loopId(loop));
  }

  /** Ids of the loops in the cache, least recently used first. For tests. */
  cached(): string[] {
    return [...this.cache.keys()];
  }

  /** Fetches and decodes a loop (once, even if asked twice while loading). Rejects on failure. */
  load(loop: SliceLoopRef): Promise<AudioBuffer> {
    const id = loopId(loop);
    const cached = this.get(loop);
    if (cached) return Promise.resolve(cached);
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.fetchBytes(id)
        .then((bytes) => this.decode(bytes))
        .then((buffer) => {
          this.keep(id, buffer);
          return buffer;
        })
        .finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    return pending;
  }

  private keep(id: string, buffer: AudioBuffer): void {
    this.cache.delete(id);
    this.cache.set(id, buffer);
    while (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private async fetchBytes(path: string): Promise<ArrayBuffer> {
    const url = this.base + path.split('/').map(encodeURIComponent).join('/');
    const response = await this.fetcher(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Dev servers answer unknown paths with the app's index.html.
    if (response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('the server returned HTML instead of the file');
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) throw new Error('empty file');
    return bytes;
  }
}
