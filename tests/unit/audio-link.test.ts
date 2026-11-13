import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SilentBackend } from '../../src/audio/silent-backend';
import { INITIAL_AUDIO_STATUS } from '../../src/core/audio-scene';
import type { NodeId } from '../../src/core/nodes';
import { linkAudio } from '../../src/state/audio-link';
import { sceneFromState } from '../../src/state/scene';
import { Store } from '../../src/state/store';

describe('linkAudio (store ↔ backend)', () => {
  let store: Store;
  let backend: SilentBackend;
  let pulses: { id: NodeId; ms: number }[];

  beforeEach(() => {
    store = new Store();
    backend = new SilentBackend();
    pulses = [];
    linkAudio(store, backend, (id, ms) => pulses.push({ id, ms }));
  });

  it('sends the current scene right away', () => {
    expect(backend.scenes).toHaveLength(1);
    expect(backend.scenes[0]).toEqual(sceneFromState(store.getState()));
  });

  it('adding a node starts the transport', () => {
    store.addNode('drum');
    expect(backend.playing).toBe(true);
    expect(backend.scenes.at(-1)!.nodes).toEqual(['master', 'drum']);
  });

  it('moves the playhead and lights DRUM when it really sounds', () => {
    store.addNode('drum');
    backend.advanceTo(0); // step 0: the default pattern has a kick
    expect(store.getState().transport.step).toBe(0);
    expect(pulses.map((p) => p.id)).toContain('drum');

    pulses = [];
    store.toggleDrumStep(0, 1); // a kick on step 1
    backend.advanceTo(0.125);
    expect(store.getState().transport.step).toBe(1);
    expect(pulses.map((p) => p.id)).toContain('drum');
  });

  it('does not light DRUM on a silent step', () => {
    store.addNode('drum');
    backend.advanceTo(0);
    pulses = [];
    backend.advanceTo(0.125); // step 1: nothing in the default pattern
    expect(pulses.map((p) => p.id)).not.toContain('drum');
  });

  it('does not resend the scene when only the playhead moves', () => {
    store.addNode('drum');
    const sent = backend.scenes.length;
    backend.advanceTo(0.5);
    expect(store.getState().transport.step).toBe(4);
    expect(backend.scenes).toHaveLength(sent);
  });

  it('forwards tempo and knob changes as new scenes', () => {
    store.setBpm(140);
    expect(backend.scenes.at(-1)!.bpm).toBe(140);
    store.setParam('master', 'volume', 0.5);
    expect(backend.scenes.at(-1)!.master.volume).toBe(0.5);
    store.setParam('drum', 'kickVolume', 0.2);
    expect(backend.scenes.at(-1)!.drum.rows.kick.volume).toBe(0.2);
  });

  it('stops the transport when playback stops', () => {
    store.addNode('drum');
    store.togglePlay();
    expect(backend.playing).toBe(false);
    expect(store.getState().transport.step).toBe(-1);
  });

  it('copies the backend status into the store', () => {
    const status = { ...INITIAL_AUDIO_STATUS, state: 'running' as const, kits: ['glitch'] };
    backend.emitStatus(status);
    expect(store.getState().audio).toEqual(status);
  });

  it('can be undone', () => {
    const fresh = new Store();
    const silent = new SilentBackend();
    const unlink = linkAudio(fresh, silent, vi.fn());
    fresh.addNode('drum');
    unlink();
    expect(silent.playing).toBe(false);
    fresh.setBpm(150);
    expect(silent.scenes.at(-1)!.bpm).not.toBe(150);
  });
});
