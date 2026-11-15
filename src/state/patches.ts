import { DEFAULT_KIT, kitLabel } from '../core/drum-kits';
import {
  migratePatch,
  parsePatch,
  parsePatchText,
  patchFileName,
  patchJson,
  PatchError,
  type KnownAssets,
  type ParsedPatch,
  type Patch,
  type PatchWarning,
} from '../core/patch';
import { decodePatchLink, encodePatchLink, MAX_LINK_LENGTH, NO_INFLATE, type PatchLink } from '../core/patch-link';
import { DEFAULT_LOOP, findLoop } from '../core/slice';
import { Emitter, type Source } from './emitter';
import { createInitialState } from './initial';
import { patchFromState, persistentSlice, sameSlice } from './patch-state';
import { SESSION_SLOT, type PatchStorage, type PatchSummary } from './patch-storage';
import type { Store } from './store';
import type { AppState } from './types';

/** What the LOAD list shows. */
export interface PatchesState {
  readonly list: readonly PatchSummary[];
  /** False when nothing will survive a reload (no IndexedDB). */
  readonly persistent: boolean;
}

export interface PatchesOptions {
  readonly persistent: boolean;
  /** A line for the display. */
  readonly notify: (text: string) => void;
  readonly now?: () => Date;
  /** How long after the last change the session is saved, ms. */
  readonly autosaveMs?: number;
}

export type ShareResult =
  | { readonly ok: true; readonly link: PatchLink }
  | { readonly ok: false; readonly reason: 'too-long'; readonly length: number };

/** Session slot name, and the copy kept before a link replaces the session. */
export const SESSION_NAME = 'Última sesión';
export const BEFORE_LINK_NAME = 'Antes del link';

/** Display lines (Spanish). */
export const PATCH_TEXT = {
  saved: (name: string) => `GUARDADO · ${name}`,
  loaded: (name: string) => `CARGADO · ${name}`,
  imported: (name: string) => `IMPORTADO · ${name}`,
  renamed: 'RENOMBRADO',
  deleted: 'BORRADO',
  notFound: 'ESE PATCH YA NO ESTÁ',
  linkCopied: 'LINK COPIADO',
  linkTooLong: 'LINK DEMASIADO LARGO · USÁ EXPORT',
  linkReady: 'PATCH LISTO · TOCÁ PLAY O UN CONTROL PARA EMPEZAR',
  linkBroken: 'LINK DAÑADO · SE MANTUVO LA SESIÓN',
  linkNoInflate: 'ESTE NAVEGADOR NO ABRE LINKS COMPRIMIDOS · PEDÍ EL ARCHIVO Y USÁ IMPORT',
  notPersistent: 'SIN ALMACENAMIENTO · NO SE VA A CONSERVAR',
  kitMissing: (wanted: string) => `KIT ${kitLabel(wanted)} NO EXISTE · SE USA ${kitLabel(DEFAULT_KIT)}`,
  loopMissing: (wanted: string) => `LOOP ${wanted} NO EXISTE · SE USA ${DEFAULT_LOOP.set} ${DEFAULT_LOOP.file}`,
  invalid: (error: unknown): string => {
    if (!(error instanceof PatchError)) return 'PATCH INVÁLIDO';
    switch (error.code) {
      case 'too-big':
        return 'PATCH DEMASIADO GRANDE · MÁXIMO 200 KB';
      case 'version':
        return 'PATCH DE UNA VERSIÓN DESCONOCIDA';
      case 'field':
        return `PATCH INVÁLIDO · ${error.detail}`.toUpperCase();
      default:
        return 'ARCHIVO INVÁLIDO · NO ES UN PATCH';
    }
  },
} as const;

/**
 * Saving, loading, sharing and importing patches, on top of the store and a storage.
 * Also the session: it is saved by itself a moment after every change and restored on
 * the next visit. Notices go to the display. Nothing here touches the DOM: the panel
 * does the clipboard, the file download and the file picker.
 */
export class Patches extends Emitter implements Source<PatchesState> {
  private state: PatchesState;
  private readonly now: () => Date;
  private readonly autosaveMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSlice: readonly unknown[];
  private unwatch: (() => void) | null = null;
  private warnedPersistence = false;

  constructor(
    private readonly store: Store,
    private readonly storage: PatchStorage,
    private readonly options: PatchesOptions,
  ) {
    super();
    this.state = { list: [], persistent: options.persistent };
    this.now = options.now ?? (() => new Date());
    this.autosaveMs = options.autosaveMs ?? 1000;
    this.lastSlice = persistentSlice(store.getState());
  }

  readonly getState = (): PatchesState => this.state;

  /** Once the storage is known: whether patches survive a reload. */
  setPersistent(persistent: boolean): void {
    if (persistent === this.state.persistent) return;
    this.state = { ...this.state, persistent };
    this.emit();
  }

  /** Reloads the list from the storage. */
  async refresh(): Promise<void> {
    const list = await this.storage.list();
    this.state = { ...this.state, list };
    this.emit();
  }

  /** The current state as a patch, named and dated now. */
  current(name: string): Patch {
    return patchFromState(this.store.getState(), name, this.now().toISOString());
  }

  /** A name for the next SAVE: the number after the ones saved. */
  suggestedName(): string {
    return `Patch ${this.state.list.length + 1}`;
  }

  // Saving and loading ---------------------------------------------------------------------------

  async save(name: string): Promise<string> {
    const clean = name.trim() || this.suggestedName();
    const id = await this.storage.save(this.current(clean));
    await this.refresh();
    this.notify(PATCH_TEXT.saved(clean));
    return id;
  }

  async load(id: string): Promise<boolean> {
    const stored = await this.storage.get(id);
    if (!stored) {
      this.notify(PATCH_TEXT.notFound);
      await this.refresh();
      return false;
    }
    try {
      // Validated again against today's manifests: a kit or loop may have gone.
      const parsed = parsePatch(stored, this.known());
      this.apply(parsed);
      this.notify(PATCH_TEXT.loaded(parsed.patch.name || '…'));
      return true;
    } catch (error) {
      this.notify(PATCH_TEXT.invalid(error));
      return false;
    }
  }

  async rename(id: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) return;
    await this.storage.rename(id, clean);
    await this.refresh();
    this.notify(PATCH_TEXT.renamed);
  }

  async remove(id: string): Promise<void> {
    await this.storage.delete(id);
    await this.refresh();
    this.notify(PATCH_TEXT.deleted);
  }

  // Files ----------------------------------------------------------------------------------------

  /** EXPORT: the file's name and its text (the patch's JSON). */
  exportFile(name: string): { readonly fileName: string; readonly text: string } {
    const patch = this.current(name.trim() || this.suggestedName());
    return { fileName: patchFileName(patch), text: patchJson(patch) };
  }

  /** IMPORT: a file's text through the validator. Returns whether it loaded. */
  importText(text: string): boolean {
    try {
      const parsed = parsePatchText(text, this.known());
      this.apply(parsed);
      this.notify(PATCH_TEXT.imported(parsed.patch.name || '…'));
      return true;
    } catch (error) {
      this.notify(PATCH_TEXT.invalid(error));
      return false;
    }
  }

  // Links ----------------------------------------------------------------------------------------

  /** SHARE: the link for the current state, or that it would be too long. */
  async share(name: string, maxLength: number = MAX_LINK_LENGTH): Promise<ShareResult> {
    const link = await encodePatchLink(this.current(name.trim() || this.suggestedName()));
    if (link.length > maxLength) {
      this.notify(PATCH_TEXT.linkTooLong);
      return { ok: false, reason: 'too-long', length: link.length };
    }
    return { ok: true, link };
  }

  /**
   * A link the page was opened with. The session is kept first, as "Antes del link"
   * (unless it is the empty start), then the patch loads without starting the sound.
   * A broken link leaves the session as it was. Returns whether it loaded.
   */
  async openLink(hashOrUrl: string): Promise<boolean> {
    let parsed: ParsedPatch;
    try {
      parsed = parsePatch(migratePatch(await decodePatchLink(hashOrUrl)), this.known());
    } catch (error) {
      console.warn('M.O.N.O.: el link no trae un patch válido.', error);
      this.notify(error instanceof PatchError && error.detail === NO_INFLATE ? PATCH_TEXT.linkNoInflate : PATCH_TEXT.linkBroken);
      return false;
    }
    if (!this.isEmptySession()) {
      await this.storage.save(this.current(BEFORE_LINK_NAME));
      await this.refresh();
    }
    this.apply(parsed);
    this.notify(PATCH_TEXT.linkReady);
    return true;
  }

  // Session --------------------------------------------------------------------------------------

  /** Loads the session saved on the last visit, if any. */
  async restoreSession(): Promise<boolean> {
    const stored = await this.storage.get(SESSION_SLOT);
    if (!stored) return false;
    try {
      this.apply(parsePatch(stored, this.known()), true);
      return true;
    } catch (error) {
      console.warn('M.O.N.O.: la sesión guardada no se pudo leer.', error);
      return false;
    }
  }

  /**
   * Saves the session by itself, a moment after every change that a patch would keep.
   * Returns a function that stops watching (and drops a pending save).
   */
  watch(): () => void {
    this.unwatch?.();
    this.lastSlice = persistentSlice(this.store.getState());
    const onChange = (): void => {
      const slice = persistentSlice(this.store.getState());
      if (sameSlice(slice, this.lastSlice)) return;
      this.lastSlice = slice;
      this.checkAssets(this.store.getState());
      this.schedule();
    };
    const unsubscribe = this.store.subscribe(onChange);
    this.unwatch = () => {
      unsubscribe();
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      this.unwatch = null;
    };
    return this.unwatch;
  }

  /** Writes the session now (a pending autosave is folded in). */
  async flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    await this.storage.save(this.current(SESSION_NAME), SESSION_SLOT);
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.autosaveMs);
    if (!this.state.persistent && !this.warnedPersistence) {
      this.warnedPersistence = true;
      this.notify(PATCH_TEXT.notPersistent);
    }
  }

  // Shared ---------------------------------------------------------------------------------------

  /** What this app's manifests have, as far as they have loaded. */
  known(): KnownAssets {
    const { audio } = this.store.getState();
    return { kits: audio.kits.length > 0 ? audio.kits : null, loops: audio.loops };
  }

  private apply(parsed: ParsedPatch, quiet = false): void {
    this.store.loadPatch(parsed.patch);
    this.lastSlice = persistentSlice(this.store.getState());
    if (!quiet) for (const warning of parsed.warnings) this.notify(this.warningText(warning));
  }

  /**
   * Once a manifest is in, a kit or loop the state names but the manifest lacks (a patch
   * loaded before the manifest) falls back to the default, and the display says so.
   */
  private checkAssets(state: AppState): void {
    const { audio, drum, bass } = state;
    if (audio.kits.length > 0 && !audio.kits.includes(drum.kit)) {
      this.notify(PATCH_TEXT.kitMissing(drum.kit));
      this.store.selectKit(DEFAULT_KIT);
    }
    if (audio.loops && !findLoop(audio.loops, bass.slice.loop)) {
      this.notify(PATCH_TEXT.loopMissing(`${bass.slice.loop.set}/${bass.slice.loop.file}`));
      this.store.selectLoop(DEFAULT_LOOP);
    }
  }

  private warningText(warning: PatchWarning): string {
    return warning.kind === 'kit' ? PATCH_TEXT.kitMissing(warning.wanted) : PATCH_TEXT.loopMissing(warning.wanted);
  }

  /** Whether the session is the empty start (only MASTER, nothing touched). */
  private isEmptySession(): boolean {
    const date = this.now().toISOString();
    const mine = patchJson(patchFromState(this.store.getState(), '', date));
    const empty = patchJson(patchFromState({ ...createInitialState(), audio: this.store.getState().audio }, '', date));
    return mine === empty;
  }

  private notify(text: string): void {
    this.options.notify(text);
  }
}
