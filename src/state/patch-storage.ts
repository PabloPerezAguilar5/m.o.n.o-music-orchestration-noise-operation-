import type { Patch } from '../core/patch';

/**
 * Where patches are kept. Only local storage exists for now (IndexedDB, or memory when
 * the browser gives none); the interface is what a cloud implementation would fill in.
 */

export interface PatchSummary {
  readonly id: string;
  readonly name: string;
  /** ISO 8601. */
  readonly date: string;
}

export interface PatchStorage {
  /** Saved patches, newest first. The session slot is not listed. */
  list(): Promise<PatchSummary[]>;
  get(id: string): Promise<Patch | null>;
  /** Saves under `id` (replacing) or under a new id. Returns the id. */
  save(patch: Patch, id?: string): Promise<string>;
  rename(id: string, name: string): Promise<void>;
  delete(id: string): Promise<void>;
}

/** The id the session is saved under as you work (restored on the next visit). */
export const SESSION_SLOT = 'session';

export const newPatchId = (): string => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** What is stored per patch. The patch is kept as it was validated. */
interface Record_ {
  readonly id: string;
  readonly name: string;
  readonly date: string;
  readonly patch: Patch;
}

const byDateDesc = (a: PatchSummary, b: PatchSummary): number => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const summaryOf = ({ id, name, date }: Record_): PatchSummary => ({ id, name, date });

/** Patches in memory: for tests, and for browsers without IndexedDB (nothing survives a reload). */
export class MemoryPatchStorage implements PatchStorage {
  private readonly records = new Map<string, Record_>();

  async list(): Promise<PatchSummary[]> {
    return [...this.records.values()]
      .filter((record) => record.id !== SESSION_SLOT)
      .map(summaryOf)
      .sort(byDateDesc);
  }

  async get(id: string): Promise<Patch | null> {
    return this.records.get(id)?.patch ?? null;
  }

  async save(patch: Patch, id = newPatchId()): Promise<string> {
    this.records.set(id, { id, name: patch.name, date: patch.date, patch });
    return id;
  }

  async rename(id: string, name: string): Promise<void> {
    const record = this.records.get(id);
    if (record) this.records.set(id, { ...record, name, patch: { ...record.patch, name } });
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}

const DB_NAME = 'mono';
const DB_VERSION = 1;
const STORE = 'patches';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });

/** Patches in IndexedDB: they survive reloads and restarts, per browser profile. */
export class IndexedDbPatchStorage implements PatchStorage {
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (or creates) the database. Rejects where IndexedDB is missing or refuses (private browsing). */
  static open(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IndexedDbPatchStorage> {
    return new Promise((resolve, reject) => {
      if (!factory) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(new IndexedDbPatchStorage(req.result));
      req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
    });
  }

  private store(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  async list(): Promise<PatchSummary[]> {
    const records = (await request(this.store('readonly').getAll())) as Record_[];
    return records
      .filter((record) => record.id !== SESSION_SLOT)
      .map(summaryOf)
      .sort(byDateDesc);
  }

  async get(id: string): Promise<Patch | null> {
    const record = (await request(this.store('readonly').get(id))) as Record_ | undefined;
    return record?.patch ?? null;
  }

  async save(patch: Patch, id = newPatchId()): Promise<string> {
    const record: Record_ = { id, name: patch.name, date: patch.date, patch };
    await request(this.store('readwrite').put(record));
    return id;
  }

  async rename(id: string, name: string): Promise<void> {
    const store = this.store('readwrite');
    const record = (await request(store.get(id))) as Record_ | undefined;
    if (!record) return;
    await request(store.put({ ...record, name, patch: { ...record.patch, name } } satisfies Record_));
  }

  async delete(id: string): Promise<void> {
    await request(this.store('readwrite').delete(id));
  }
}

/** A storage that is still opening: every call waits for it. Lets the app wire itself up synchronously. */
export class LazyPatchStorage implements PatchStorage {
  constructor(private readonly opening: Promise<PatchStorage>) {}

  list(): Promise<PatchSummary[]> {
    return this.opening.then((storage) => storage.list());
  }

  get(id: string): Promise<Patch | null> {
    return this.opening.then((storage) => storage.get(id));
  }

  save(patch: Patch, id?: string): Promise<string> {
    return this.opening.then((storage) => storage.save(patch, id));
  }

  rename(id: string, name: string): Promise<void> {
    return this.opening.then((storage) => storage.rename(id, name));
  }

  delete(id: string): Promise<void> {
    return this.opening.then((storage) => storage.delete(id));
  }
}

export interface OpenedStorage {
  readonly storage: PatchStorage;
  /** False when patches live in memory only (they are lost on reload). */
  readonly persistent: boolean;
}

/** IndexedDB if the browser allows it; otherwise memory, and the caller warns. */
export async function openPatchStorage(factory?: IDBFactory): Promise<OpenedStorage> {
  try {
    return { storage: await IndexedDbPatchStorage.open(factory), persistent: true };
  } catch (error) {
    console.warn('M.O.N.O.: sin IndexedDB; los patches no se van a conservar.', error);
    return { storage: new MemoryPatchStorage(), persistent: false };
  }
}
