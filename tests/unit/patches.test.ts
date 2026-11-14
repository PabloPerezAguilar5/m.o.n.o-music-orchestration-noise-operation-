import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_AUDIO_STATUS } from '../../src/core/audio-scene';
import { parsePatch, patchJson } from '../../src/core/patch';
import { encodePatchLink } from '../../src/core/patch-link';
import { patchFromState } from '../../src/state/patch-state';
import { MemoryPatchStorage, SESSION_SLOT } from '../../src/state/patch-storage';
import { BEFORE_LINK_NAME, PATCH_TEXT, Patches, SESSION_NAME } from '../../src/state/patches';
import { Store } from '../../src/state/store';

const DATE = '2026-11-14T12:00:00.000Z';

describe('MemoryPatchStorage', () => {
  it('lists newest first, without the session slot; gets, renames and deletes', async () => {
    const storage = new MemoryPatchStorage();
    const store = new Store();
    const a = await storage.save(patchFromState(store.getState(), 'A', '2026-01-01T00:00:00.000Z'));
    const b = await storage.save(patchFromState(store.getState(), 'B', '2026-02-01T00:00:00.000Z'));
    await storage.save(patchFromState(store.getState(), SESSION_NAME, '2026-03-01T00:00:00.000Z'), SESSION_SLOT);
    expect((await storage.list()).map((p) => p.name)).toEqual(['B', 'A']);
    expect((await storage.get(a))?.name).toBe('A');
    expect((await storage.get(SESSION_SLOT))?.name).toBe(SESSION_NAME);
    expect(await storage.get('nope')).toBeNull();
    await storage.rename(a, 'A2');
    expect((await storage.get(a))?.name).toBe('A2');
    expect((await storage.list()).find((p) => p.id === a)?.name).toBe('A2');
    await storage.delete(b);
    expect((await storage.list()).map((p) => p.id)).toEqual([a]);
    // Saving under an id replaces.
    await storage.save(patchFromState(store.getState(), 'A3', DATE), a);
    expect((await storage.list()).map((p) => p.name)).toEqual(['A3']);
  });
});

describe('Patches', () => {
  let store: Store;
  let storage: MemoryPatchStorage;
  let notices: string[];
  let patches: Patches;
  let clock: number;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new Store();
    storage = new MemoryPatchStorage();
    notices = [];
    clock = 0;
    patches = new Patches(store, storage, {
      persistent: true,
      notify: (text) => notices.push(text),
      now: () => new Date(Date.parse(DATE) + clock++),
      autosaveMs: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves with a name, lists it, loads it back and reports on the display', async () => {
    store.addNode('drum');
    store.setBpm(150);
    const id = await patches.save('  Mi groove ');
    expect(patches.getState().list.map((p) => p.name)).toEqual(['Mi groove']);
    expect(notices).toEqual([PATCH_TEXT.saved('Mi groove')]);

    store.removeNode('drum');
    store.setBpm(90);
    expect(await patches.load(id)).toBe(true);
    expect(store.getState().added).toEqual(['master', 'drum']);
    expect(store.getState().transport.bpm).toBe(150);
    expect(notices.at(-1)).toBe(PATCH_TEXT.loaded('Mi groove'));

    expect(await patches.load('gone')).toBe(false);
    expect(notices.at(-1)).toBe(PATCH_TEXT.notFound);
  });

  it('an empty name gets the suggested one; rename and delete update the list', async () => {
    const id = await patches.save('');
    expect(patches.getState().list[0]?.name).toBe('Patch 1');
    expect(patches.suggestedName()).toBe('Patch 2');
    await patches.rename(id, 'Otro');
    expect(patches.getState().list[0]?.name).toBe('Otro');
    await patches.remove(id);
    expect(patches.getState().list).toEqual([]);
  });

  it('saves the session a second after the last change, once, and not for the playhead', async () => {
    const stop = patches.watch();
    store.addNode('drum');
    store.setBpm(100);
    store.setBpm(101);
    await vi.advanceTimersByTimeAsync(900);
    expect(await storage.get(SESSION_SLOT)).toBeNull();
    await vi.advanceTimersByTimeAsync(200);
    const saved = await storage.get(SESSION_SLOT);
    expect(saved?.name).toBe(SESSION_NAME);
    expect(saved?.bpm).toBe(101);
    expect(saved?.nodes).toEqual(['master', 'drum']);

    // The playhead moving is not a change worth saving.
    const stamp = saved?.date;
    store.setStep(3);
    store.setStep(4);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await storage.get(SESSION_SLOT))?.date).toBe(stamp);
    expect((await storage.list()).length).toBe(0); // the session is not in the list
    stop();
    store.setBpm(120);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await storage.get(SESSION_SLOT))?.bpm).toBe(101);
  });

  it('restores the session on the next visit', async () => {
    patches.watch();
    store.addNode('bass');
    store.setBassVoice('slice');
    await vi.advanceTimersByTimeAsync(1100);

    const next = new Store();
    const again = new Patches(next, storage, { persistent: true, notify: () => undefined });
    expect(await again.restoreSession()).toBe(true);
    expect(next.getState().added).toEqual(['master', 'bass']);
    expect(next.getState().bass.voice).toBe('slice');
    expect(next.getState().transport.playing).toBe(false);

    const fresh = new Patches(new Store(), new MemoryPatchStorage(), { persistent: true, notify: () => undefined });
    expect(await fresh.restoreSession()).toBe(false);
  });

  it('warns once that nothing will be kept when the storage is memory only', async () => {
    patches.setPersistent(false);
    patches.watch();
    store.addNode('drum');
    store.setBpm(99);
    expect(notices.filter((n) => n === PATCH_TEXT.notPersistent)).toHaveLength(1);
  });

  it('exports the patch as JSON text with a file name, and imports it back', () => {
    store.addNode('synth');
    const { fileName, text } = patches.exportFile('Mi export');
    expect(fileName).toBe('mi-export.mono');
    expect(JSON.parse(text)).toMatchObject({ v: 1, name: 'Mi export', nodes: ['master', 'synth'] });
    store.removeNode('synth');
    expect(patches.importText(text)).toBe(true);
    expect(store.getState().added).toEqual(['master', 'synth']);
    expect(notices.at(-1)).toBe(PATCH_TEXT.imported('Mi export'));
  });

  it('refuses garbage on import, saying why, and leaves the state as it was', () => {
    store.addNode('drum');
    const before = store.getState();
    expect(patches.importText('esto no es json')).toBe(false);
    expect(notices.at(-1)).toBe('ARCHIVO INVÁLIDO · NO ES UN PATCH');
    expect(patches.importText('{"v":1,"bpm":"rapido"}')).toBe(false);
    expect(notices.at(-1)).toBe('PATCH INVÁLIDO · BPM');
    expect(patches.importText('{"v":7}')).toBe(false);
    expect(notices.at(-1)).toBe('PATCH DE UNA VERSIÓN DESCONOCIDA');
    expect(patches.importText(JSON.stringify({ v: 1, name: 'x'.repeat(300_000) }))).toBe(false);
    expect(notices.at(-1)).toBe('PATCH DEMASIADO GRANDE · MÁXIMO 200 KB');
    expect(store.getState()).toBe(before);
  });

  it('a kit or loop that the manifests lack is replaced and announced, on import and once the manifests arrive', () => {
    store.setAudioStatus({ ...INITIAL_AUDIO_STATUS, kits: ['samples808', 'glitch'], loops: [{ set: 'line', file: 'a-128-c.wav', variant: 'a', bars: 1, bpm: 128, key: 'C' }] });
    const text = JSON.stringify({ v: 1, name: 'raro', drum: { kit: 'vinyl' }, bass: { slice: { loop: { set: 'arp', file: 'q-128-c.wav' } } } });
    expect(patches.importText(text)).toBe(true);
    expect(store.getState().drum.kit).toBe('samples808');
    expect(notices).toContain(PATCH_TEXT.kitMissing('vinyl'));
    expect(notices).toContain(PATCH_TEXT.loopMissing('arp/q-128-c.wav'));

    // Loaded before the manifests (a link at start-up): checked when they come in.
    const early = new Store();
    const earlyNotices: string[] = [];
    const earlyPatches = new Patches(early, new MemoryPatchStorage(), { persistent: true, notify: (t) => earlyNotices.push(t) });
    earlyPatches.watch();
    expect(earlyPatches.importText(text)).toBe(true);
    expect(early.getState().drum.kit).toBe('vinyl');
    expect(earlyNotices).toEqual([PATCH_TEXT.imported('raro')]);
    early.setAudioStatus({ ...INITIAL_AUDIO_STATUS, kits: ['samples808'] });
    early.setBpm(121); // a change the watcher sees
    expect(early.getState().drum.kit).toBe('samples808');
    expect(earlyNotices).toContain(PATCH_TEXT.kitMissing('vinyl'));
  });

  it('SHARE gives a link, or says it is too long', async () => {
    store.addNode('drum');
    const result = await patches.share('Link');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.link.hash.startsWith('#p=1.')).toBe(true);
    const short = await patches.share('Link', 10);
    expect(short).toMatchObject({ ok: false, reason: 'too-long' });
    expect(notices.at(-1)).toBe(PATCH_TEXT.linkTooLong);
  });

  it('a link loads without starting the sound, after keeping the session as "Antes del link"', async () => {
    store.addNode('drum');
    store.setBpm(111);
    const shared = patchFromState((() => {
      const s = new Store();
      s.addNode('synth');
      s.setBpm(140);
      s.togglePlay();
      return s.getState();
    })(), 'Del link', DATE);
    const link = await encodePatchLink(shared);
    expect(store.getState().transport.playing).toBe(true); // the session was playing

    expect(await patches.openLink(`http://x/${link.hash}`)).toBe(true);
    expect(store.getState().added).toEqual(['master', 'synth']);
    expect(store.getState().transport.bpm).toBe(140);
    const kept = patches.getState().list;
    expect(kept.map((p) => p.name)).toEqual([BEFORE_LINK_NAME]);
    expect((await storage.get(kept[0]!.id))?.bpm).toBe(111);
    expect(notices.at(-1)).toBe(PATCH_TEXT.linkReady);
  });

  it('a link into a fresh session keeps no copy, and the sound stays off', async () => {
    const link = await encodePatchLink(patchFromState(new Store().getState(), 'x', DATE));
    expect(await patches.openLink(link.hash)).toBe(true);
    expect(patches.getState().list).toEqual([]);
    expect(store.getState().transport.playing).toBe(false);
  });

  it('a broken link says so and changes nothing', async () => {
    store.addNode('drum');
    const before = store.getState();
    expect(await patches.openLink('#p=1.roto')).toBe(false);
    expect(store.getState()).toBe(before);
    expect(patches.getState().list).toEqual([]);
    expect(notices.at(-1)).toBe(PATCH_TEXT.linkBroken);
    const newer = `#p=1.${(await encodePatchLink(patchFromState(before, 'x', DATE))).hash.slice(5)}`;
    expect(await patches.openLink(newer.replace('#p=1.', '#p=3.'))).toBe(false);
  });

  it('stored patches are validated again when loaded (a stale kit falls back)', async () => {
    const id = await storage.save({ ...parsePatch(JSON.parse(patchJson(patches.current('viejo')))).patch, drum: { kit: 'gone', seed: 1, pattern: [] } });
    store.setAudioStatus({ ...INITIAL_AUDIO_STATUS, kits: ['samples808'] });
    expect(await patches.load(id)).toBe(true);
    expect(store.getState().drum.kit).toBe('samples808');
    expect(notices).toContain(PATCH_TEXT.kitMissing('gone'));
  });
});
