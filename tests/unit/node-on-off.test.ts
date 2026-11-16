import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SilentBackend } from '../../src/audio/silent-backend';
import { Strip } from '../../src/audio/strip';
import { allOn, MUTE_IDS, type NodeId } from '../../src/core/nodes';
import { parsePatch, PatchError, patchJson } from '../../src/core/patch';
import { decodePatchLink, encodePatchLink } from '../../src/core/patch-link';
import { linkAudio } from '../../src/state/audio-link';
import { Live, type Lights } from '../../src/state/live';
import { patchFromState } from '../../src/state/patch-state';
import { sceneFromState } from '../../src/state/scene';
import { Store } from '../../src/state/store';
import { FakeContext, FakeModule, type FakeGain } from './fake-audio';

describe('ON/OFF of a node: state', () => {
  it('every node with a level knob starts ON; the rest has no key', () => {
    const store = new Store();
    expect(MUTE_IDS).toEqual(['synth', 'drum', 'bass', 'drone', 'lead']);
    expect(store.getState().on).toEqual(allOn());
    store.setNodeOn('dist', false); // no level knob: nothing to mute
    store.setNodeOn('lfo', false);
    store.setNodeOn('master', false);
    expect(store.getState().on).toEqual(allOn());
  });

  it('toggles one node and leaves the others; the scene carries it', () => {
    const store = new Store();
    store.addNode('drum');
    store.addNode('bass');
    store.toggleNodeOn('drum');
    expect(store.getState().on).toEqual({ ...allOn(), drum: false });
    expect(sceneFromState(store.getState()).on.drum).toBe(false);
    expect(sceneFromState(store.getState()).on.bass).toBe(true);
    store.toggleNodeOn('drum');
    expect(store.getState().on.drum).toBe(true);
  });

  it('a node added again starts ON, and CLEAR puts everything back ON', () => {
    const store = new Store();
    store.addNode('lead');
    store.setNodeOn('lead', false);
    store.removeNode('lead');
    store.addNode('lead');
    expect(store.getState().on.lead).toBe(true);
    store.setNodeOn('lead', false);
    store.clearCanvas();
    expect(store.getState().on).toEqual(allOn());
  });
});

describe('ON/OFF in the patch', () => {
  const DATE = '2026-11-15T12:00:00.000Z';
  const offStore = (): Store => {
    const store = new Store();
    for (const id of ['drum', 'synth', 'lead'] as const) store.addNode(id);
    store.setNodeOn('drum', false);
    store.setNodeOn('lead', false);
    return store;
  };

  it('is saved and restored, through JSON too', () => {
    const patch = patchFromState(offStore().getState(), 'x', DATE);
    expect(patch.on).toEqual({ synth: true, drum: false, bass: true, drone: true, lead: false });
    const parsed = parsePatch(JSON.parse(patchJson(patch))).patch;
    expect(parsed.on).toEqual(patch.on);
    const fresh = new Store();
    fresh.loadPatch(parsed);
    expect(fresh.getState().on).toEqual(patch.on);
    expect(patchFromState(fresh.getState(), 'x', DATE)).toEqual(patch);
  });

  it('goes through a SHARE link and an EXPORT file (JSON) as it was', async () => {
    const patch = patchFromState(offStore().getState(), 'link', DATE);
    const link = await encodePatchLink(patch);
    expect(parsePatch(await decodePatchLink(link.hash)).patch.on).toEqual(patch.on);
    expect(parsePatch(JSON.parse(patchJson(patch))).patch.on).toEqual(patch.on);
  });

  it('an old patch without the field loads with every node ON, and the version is the same', () => {
    const raw = JSON.parse(patchJson(patchFromState(offStore().getState(), 'viejo', DATE))) as Record<string, unknown>;
    delete raw.on;
    const { patch } = parsePatch(raw);
    expect(patch.v).toBe(1);
    expect(patch.on).toEqual(allOn());
    const store = new Store();
    store.addNode('drum');
    store.setNodeOn('drum', false);
    store.loadPatch(patch);
    expect(store.getState().on).toEqual(allOn());
  });

  it('a node missing from `on` is ON; ids it does not know are left out', () => {
    const raw = JSON.parse(patchJson(patchFromState(new Store().getState(), 'p', DATE))) as Record<string, unknown>;
    raw.on = { drum: false, dist: false, nothing: 3 };
    expect(parsePatch(raw).patch.on).toEqual({ ...allOn(), drum: false });
  });

  it('the strict validator refuses values that are not booleans', () => {
    const base = (): Record<string, unknown> => JSON.parse(patchJson(patchFromState(new Store().getState(), 'p', DATE)));
    const code = (value: unknown): string => {
      try {
        parsePatch(value);
        return 'ok';
      } catch (error) {
        return error instanceof PatchError ? `${error.code}:${error.detail}` : 'other';
      }
    };
    for (const bad of ['no', 0, 1, null, [], {}]) {
      expect(code({ ...base(), on: { drum: bad } }), JSON.stringify(bad)).toBe('field:on.drum');
    }
    expect(code({ ...base(), on: 'off' })).toBe('field:on');
    expect(code({ ...base(), on: [true] })).toBe('field:on');
    expect(code({ ...base(), on: { drum: false } })).toBe('ok');
  });
});

describe('ON/OFF at the output of a node (Strip)', () => {
  let context: FakeContext;
  let inner: FakeModule;
  let strip: Strip;
  const gate = (): FakeGain => context.gains[0]!;

  beforeEach(() => {
    context = new FakeContext();
    inner = new FakeModule();
    strip = new Strip(context as unknown as BaseAudioContext, inner as never, 0.5);
  });

  it('the module feeds the gate, then the level; both stay connected while OFF', () => {
    const [gateNode, levelNode] = context.gains;
    expect(inner.output.connections.has(gateNode!)).toBe(true);
    expect(gateNode!.connections.has(levelNode!)).toBe(true);
    expect(strip.output).toBe(levelNode);
    strip.setMuted(true, 1);
    expect(inner.output.connections.has(gateNode!)).toBe(true); // it keeps running; only the gate closes
  });

  it('OFF fades to silence in about 25 ms and settles on exactly zero, not at the next bar', () => {
    expect(gate().gain.value).toBe(1);
    strip.setMuted(true, 2);
    const [fade, settle] = gate().gain.events;
    expect(fade).toMatchObject({ kind: 'target', value: 0, time: 2 }); // starts at once
    expect(settle).toMatchObject({ kind: 'set', value: 0 });
    expect(settle!.time - 2).toBeLessThan(0.1);
    expect(settle!.time - 2).toBeGreaterThan(0.025);
  });

  it('ON again while the last fade is settling cancels the settle, so it cannot close the gate', () => {
    strip.setMuted(true, 2);
    strip.setMuted(false, 2.01); // before the settle (2.04)
    const events = gate().gain.events;
    expect(events.filter((e) => e.kind === 'set' && e.value === 0)).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ kind: 'set', value: 1 });
  });

  it('a strip made for a node that is OFF starts closed', () => {
    const closed = new Strip(context as unknown as BaseAudioContext, new FakeModule() as never, 0.5, true);
    expect(context.gains[2]!.gain.value).toBe(0);
    expect(closed.output).toBe(context.gains[3]);
  });

  it('level and ON/OFF are independent', () => {
    strip.setMuted(true, 1);
    strip.setLevel(0.9, 1);
    expect(gate().gain.events.every((event) => event.value === 0)).toBe(true);
    expect((strip.output as unknown as FakeGain).gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0.9 });
  });
});

describe('ON/OFF and the clock', () => {
  let store: Store;
  let backend: SilentBackend;
  let pulses: NodeId[];

  beforeEach(() => {
    store = new Store();
    backend = new SilentBackend();
    pulses = [];
    linkAudio(store, backend, (id) => pulses.push(id));
  });

  it('an OFF node keeps sequencing (so it comes back in time) but does not count as sounding', () => {
    store.addNode('synth');
    store.setNodeOn('synth', false);
    backend.advanceTo(0); // step 0 has a chord
    const events = backend.synthEvents.length;
    expect(events).toBeGreaterThan(0);
    expect(pulses).not.toContain('synth');

    backend.advanceTo(0.125 * 16); // one more bar
    expect(backend.synthEvents.length).toBeGreaterThan(events); // still sequencing
    const ons = backend.synthEvents.filter((e) => e.type === 'on').map((e) => e.id);
    const offs = new Set(backend.synthEvents.filter((e) => e.type === 'off').map((e) => e.id));
    expect(ons.every((id) => offs.has(id))).toBe(true); // every note has its release: none hangs

    store.setNodeOn('synth', true);
    pulses.length = 0;
    backend.advanceTo(0.125 * 16 * 2);
    expect(pulses).toContain('synth'); // lit again, on the same grid
  });

  it('an ON node lights as before', () => {
    store.addNode('drum');
    backend.advanceTo(0);
    expect(pulses).toContain('drum');
  });
});

describe('ON/OFF and the live nodes', () => {
  it('LEAD OFF does not light up, and keeps its key held', () => {
    const store = new Store();
    const lit: { id: NodeId; on: boolean }[] = [];
    const lights: Lights = { pulse: vi.fn(), hold: (id, on) => lit.push({ id, on }) };
    const live = new Live(store, lights);
    store.addNode('lead');
    store.setNodeOn('lead', false);
    live.keyDown(1, 5);
    expect(live.getState().keys.has(5)).toBe(true); // the keyboard still shows it
    expect(lit.filter((l) => l.on)).toEqual([]); // but the node does not glow
    store.setNodeOn('lead', true);
    expect(lit.filter((l) => l.on)).toEqual([{ id: 'lead', on: true }]); // held key, now heard
  });
});
