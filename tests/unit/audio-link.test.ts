import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SilentBackend } from '../../src/audio/silent-backend';
import { INITIAL_AUDIO_STATUS } from '../../src/core/audio-scene';
import type { NodeId } from '../../src/core/nodes';
import { linkAudio } from '../../src/state/audio-link';
import { Cues } from '../../src/state/cues';
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

  it('clicks on the beats with the same clock as the steps, with any node or none', () => {
    store.toggleMetronome();
    store.togglePlay(); // only MASTER on the canvas
    // One bar at 120 bpm (steps every 0.125 s), woken up every 50 ms like the real ticker.
    for (let ms = 0; ms <= 2000; ms += 50) backend.advanceTo(ms / 1000);
    expect(backend.clicks).toEqual([
      { step: 0, time: 0, click: 'accent' },
      { step: 4, time: 0.5, click: 'beat' },
      { step: 8, time: 1, click: 'beat' },
      { step: 12, time: 1.5, click: 'beat' },
      { step: 0, time: 2, click: 'accent' },
    ]);
  });

  it('does not click while the metronome is off', () => {
    store.addNode('drum');
    for (let ms = 0; ms <= 2000; ms += 50) backend.advanceTo(ms / 1000);
    expect(store.getState().transport.step).toBe(0); // it did play a whole bar
    expect(backend.clicks).toEqual([]);
  });

  it('BASS plays its notes on the shared clock and lights up when it sounds', () => {
    store.addNode('bass');
    for (let ms = 0; ms <= 950; ms += 50) backend.advanceTo(ms / 1000);
    // Steps 0..7 of the default line: notes on 0, 3 and 6 (accent on 0).
    const ons = backend.bassEvents.filter((event) => event.type === 'on');
    expect(ons.map((event) => event.time)).toEqual([0, 0.375, 0.75]);
    expect(ons[0]).toMatchObject({ midi: 36, accent: true, legato: false });
    expect(pulses.filter((p) => p.id === 'bass')).toHaveLength(3);
  });

  it('a cut BASS cable silences it and leaves it dark; plugging it back resumes', () => {
    store.addNode('bass');
    store.toggleCable('bass');
    expect(backend.scenes.at(-1)!.cables).toEqual([]);
    for (let ms = 0; ms <= 1000; ms += 50) backend.advanceTo(ms / 1000);
    expect(backend.bassEvents).toEqual([]);
    expect(pulses.some((p) => p.id === 'bass')).toBe(false);
    store.toggleCable('bass');
    expect(backend.scenes.at(-1)!.cables).toEqual(['bass']);
    for (let ms = 1050; ms <= 2000; ms += 50) backend.advanceTo(ms / 1000);
    expect(backend.bassEvents.some((event) => event.type === 'on')).toBe(true);
  });

  it('SYNTH plays its chords on the shared clock, lights up, and its cable cuts it', () => {
    store.addNode('synth');
    for (let ms = 0; ms <= 950; ms += 50) backend.advanceTo(ms / 1000);
    // Steps 0..7 of the default pattern: a 3-note chord on 0, single notes on 2, 5 and 7.
    const ons = backend.synthEvents.filter((event) => event.type === 'on');
    expect(ons.map((event) => event.time)).toEqual([0, 0, 0, 0.25, 0.625, 0.875]);
    expect(pulses.filter((p) => p.id === 'synth')).toHaveLength(4);

    store.toggleCable('synth');
    const before = backend.synthEvents.length;
    for (let ms = 1000; ms <= 2000; ms += 50) backend.advanceTo(ms / 1000);
    expect(backend.synthEvents).toHaveLength(before);
  });

  it('BASS, DRUM and SYNTH light up together on a shared step', () => {
    store.addNode('drum');
    store.addNode('bass');
    store.addNode('synth');
    backend.advanceTo(0);
    expect(pulses.map((p) => p.id)).toEqual(expect.arrayContaining(['drum', 'bass', 'synth']));
  });

  it('SLIDE OFF reaches the sequencer: the same line plays without legato notes', () => {
    store.addNode('bass');
    store.toggleBassStep(4, 4); // a tonic on step 5, right after the slide on step 4
    const legatos = () => backend.bassEvents.filter((event) => event.type === 'on' && event.legato).length;
    for (let ms = 0; ms <= 1950; ms += 50) backend.advanceTo(ms / 1000);
    expect(legatos()).toBe(1); // slides on: step 4 glides into step 5

    store.toggleBassSlides();
    expect(backend.scenes.at(-1)!.bass.slides).toBe(false);
    for (let ms = 2000; ms <= 3950; ms += 50) backend.advanceTo(ms / 1000);
    expect(legatos()).toBe(1); // none in the second bar
    expect(backend.bassEvents.filter((event) => event.type === 'on' && event.time >= 2)).toHaveLength(7);
  });

  it('forwards BASS key, knobs and keys as scenes', () => {
    store.nudgeRoot(1);
    store.setParam('bass', 'cutoff', 0.8);
    store.toggleBassSub();
    expect(backend.scenes.at(-1)!.bass).toMatchObject({ root: 1, cutoff: 0.8, sub: true });
  });

  it('passes kit auditions to the backend', () => {
    const fresh = new Store();
    const silent = new SilentBackend();
    const cues = new Cues();
    linkAudio(fresh, silent, vi.fn(), cues);
    cues.send({ type: 'audition', kit: 'trip' });
    expect(silent.auditions).toEqual(['trip']);
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
