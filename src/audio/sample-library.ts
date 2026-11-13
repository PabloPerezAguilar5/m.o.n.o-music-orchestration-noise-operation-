import { filesForRow, parseDrumManifest, type DrumManifest } from '../core/drum-kits';
import { DRUM_ROWS, type DrumRow } from '../core/nodes';
import type { LoadedKit } from './drum-module';

export type Decode = (data: ArrayBuffer) => Promise<AudioBuffer>;

/** Where the drum samples are served. */
export const SAMPLES_BASE = `${import.meta.env.BASE_URL}samples/drums/`;
export const MANIFEST_FILE = 'manifest.json';

/**
 * Loads the drum manifest and kits. Loading never throws: a file that fails is
 * reported in `failed` and its row falls back to the synthesized voice
 * (the "load with fallback" of fck-synth). Kits are loaded once and kept.
 */
export class SampleLibrary {
  private manifest: Promise<DrumManifest> | null = null;
  private readonly kits = new Map<string, Promise<LoadedKit>>();

  constructor(
    private readonly decode: Decode,
    private readonly base: string = SAMPLES_BASE,
    private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  /** The manifest. Rejects if it cannot be loaded or is invalid; a later call retries. */
  loadManifest(): Promise<DrumManifest> {
    this.manifest ??= this.fetchBytes(MANIFEST_FILE)
      .then((bytes) => parseDrumManifest(JSON.parse(new TextDecoder().decode(bytes))))
      .catch((error: unknown) => {
        this.manifest = null;
        throw error;
      });
    return this.manifest;
  }

  /** A kit's samples, by row. Never rejects. */
  loadKit(id: string): Promise<LoadedKit> {
    let kit = this.kits.get(id);
    if (!kit) {
      kit = this.fetchKit(id);
      this.kits.set(id, kit);
      // A kit that failed completely (e.g. no manifest yet) is retried on the next request.
      void kit.then((loaded) => {
        if (loaded.failed.includes(MANIFEST_FILE)) this.kits.delete(id);
      });
    }
    return kit;
  }

  private async fetchKit(id: string): Promise<LoadedKit> {
    const rows = Object.fromEntries(DRUM_ROWS.map((row) => [row, [] as AudioBuffer[]])) as Record<
      DrumRow,
      AudioBuffer[]
    >;
    let manifest: DrumManifest;
    try {
      manifest = await this.loadManifest();
    } catch (error) {
      console.warn(`M.O.N.O.: no se pudo cargar ${MANIFEST_FILE}.`, error);
      return { id, rows, failed: [MANIFEST_FILE] };
    }
    const entry = manifest.kits.find((kit) => kit.id === id);
    if (!entry) {
      console.warn(`M.O.N.O.: el kit ${id} no esta en ${MANIFEST_FILE}.`);
      return { id, rows, failed: [MANIFEST_FILE] };
    }

    const failed: string[] = [];
    await Promise.all(
      DRUM_ROWS.map(async (row) => {
        const files = filesForRow(entry, row);
        const buffers = await Promise.all(
          files.map(async (file) => {
            try {
              return await this.decode(await this.fetchBytes(`${id}/${file}`));
            } catch (error) {
              console.warn(`M.O.N.O.: no se pudo cargar ${id}/${file}.`, error);
              failed.push(file);
              return null;
            }
          }),
        );
        // Variants keep their manifest order; failed ones are simply skipped.
        rows[row] = buffers.filter((buffer): buffer is AudioBuffer => buffer !== null);
      }),
    );
    return { id, rows, failed };
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
