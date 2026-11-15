import { describe, expect, it, vi } from 'vitest';
import { sceneFromState } from '../../src/state/scene';
import { clearedState } from '../../src/state/patch-state';
import { MemoryPatchStorage, SESSION_SLOT } from '../../src/state/patch-storage';
import { PATCH_TEXT, Patches } from '../../src/state/patches';
import { Store } from '../../src/state/store';
import { createInitialState } from '../../src/state/initial';

const DATE = '2026-11-14T12:00:00.000Z';

function build() {
  const store = new Store();
  const storage = new MemoryPatchStorage();
  const notices: string[] = [];
  const patches = new Patches(store, storage, {
    persistent: true,
    notify: (text) => notices.push(text),
    now: () => new Date(DATE),
    autosaveMs: 1000,
  });
  return { store, storage, notices, patches };
}

function busyStore(store: Store): void {
  for (const id of ['drum', 'bass', 'synth', 'lead', 'drone', 'dist', 'lfo'] as const) store.addNode(id);
  store.connect('bass', 'dist');
  store.connect('lfo', 'synth');
  store.setBpm(97);
  store.setParam('master', 'volume', 0.31);
  store.setParam('master', 'space', 0.12);
  store.setParam('drum', 'macro', 0.9);
  store.togglePlay();
  store.selectNode('synth');
}

describe('clearCanvas', () => {
  it('leaves only MASTER, no cables, stopped and selected, with every node back to its defaults', () => {
    const { store } = busyStore2();
    store.clearCanvas();
    const state = store.getState();
    expect(state.added).toEqual(['master']);
    expect(state.cables).toEqual([]);
    expect(state.selected).toBe('master');
    expect(state.transport.playing).toBe(false);
    expect(state.transport.step).toBe(-1);
    const fresh = createInitialState();
    expect(state.params.drum).toEqual(fresh.params.drum);
    expect(state.positions).toEqual(fresh.positions);
    expect(state.key).toEqual(fresh.key);
    expect(state.drum.pattern).toEqual(fresh.drum.pattern);
  });

  it("keeps MASTER's knobs, the tempo and the metronome", () => {
    const { store } = busyStore2();
    store.toggleMetronome();
    store.setMetronomeVolume(0.4);
    const before = store.getState();
    store.clearCanvas();
    const after = store.getState();
    expect(after.params.master).toEqual(before.params.master);
    expect(after.params.master.volume).toBe(0.31);
    expect(after.transport.bpm).toBe(97);
    expect(after.metronome).toEqual(before.metronome);
  });

  it('gives the audio one scene with nothing but MASTER (the usual structural path)', () => {
    const { store } = busyStore2();
    const scenes: ReturnType<typeof sceneFromState>[] = [];
    store.subscribe(() => scenes.push(sceneFromState(store.getState())));
    store.clearCanvas();
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.nodes).toEqual(['master']);
    expect(scenes[0]!.cables).toEqual([]);
  });

  it('a node added afterwards starts fresh, not as it was left', () => {
    const { store } = busyStore2();
    store.clearCanvas();
    store.addNode('drum');
    expect(store.getState().params.drum).toEqual(createInitialState().params.drum);
  });

  it('is a pure function of the state: clearedState does not touch its input', () => {
    const { store } = busyStore2();
    const state = store.getState();
    const snapshot = JSON.stringify(state);
    clearedState(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('Patches.clearCanvas', () => {
  it('does not touch saved patches', async () => {
    const { store, storage, patches } = build();
    busyStore(store);
    await patches.save('Mi patch');
    const before = await storage.list();
    await patches.clearCanvas();
    expect(await storage.list()).toEqual(before);
    const saved = await storage.get(before[0]!.id);
    expect(saved?.nodes.length).toBe(8);
  });

  it('writes the empty canvas as the session right away, and a restart finds it empty', async () => {
    vi.useFakeTimers();
    try {
      const { store, storage, patches, notices } = build();
      patches.watch();
      busyStore(store);
      await vi.advanceTimersByTimeAsync(1100);
      expect((await storage.get(SESSION_SLOT))?.nodes.length).toBe(8);

      await patches.clearCanvas();
      // No waiting for the autosave: it is already written.
      const session = await storage.get(SESSION_SLOT);
      expect(session?.nodes).toEqual(['master']);
      expect(session?.cables).toEqual([]);
      expect(session?.params.master?.volume).toBe(0.31);
      expect(notices.at(-1)).toBe(PATCH_TEXT.cleared);

      // The next visit restores that: nothing old comes back.
      const next = new Store();
      const again = new Patches(next, storage, { persistent: true, notify: () => undefined, autosaveMs: 1000 });
      expect(await again.restoreSession()).toBe(true);
      expect(next.getState().added).toEqual(['master']);
      expect(next.getState().cables).toEqual([]);
      // And no stray save is left pending to bring it back.
      await vi.advanceTimersByTimeAsync(2000);
      expect((await storage.get(SESSION_SLOT))?.nodes).toEqual(['master']);
    } finally {
      vi.useRealTimers();
    }
  });
});

function busyStore2(): { store: Store } {
  const store = new Store();
  busyStore(store);
  return { store };
}
