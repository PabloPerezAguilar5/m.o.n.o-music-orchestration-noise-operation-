import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateDrumPattern,
  gridFromPattern,
  INITIAL_SEED,
  MANUAL_HIT,
} from '../../src/core/drum-patterns';
import { INSTRUMENT_IDS } from '../../src/core/nodes';
import { DEFAULT_PATTERNS } from '../../src/core/patterns';
import { Activity } from '../../src/state/activity';
import { Store } from '../../src/state/store';

describe('Store', () => {
  let store: Store;
  beforeEach(() => {
    store = new Store();
  });

  it('starts with only master, selected and stopped', () => {
    const state = store.getState();
    expect(state.added).toEqual(['master']);
    expect(state.selected).toBe('master');
    expect(state.transport).toEqual({ playing: false, bpm: 120, step: -1 });
  });

  it('adding a node selects it and starts playback', () => {
    expect(store.addNode('synth')).toBe(true);
    const state = store.getState();
    expect(state.added).toEqual(['master', 'synth']);
    expect(state.selected).toBe('synth');
    expect(state.transport.playing).toBe(true);
  });

  it('allows one node per type, seven at most', () => {
    expect(store.addNode('drum')).toBe(true);
    expect(store.addNode('drum')).toBe(false);
    expect(store.addNode('master')).toBe(false);
    for (const id of INSTRUMENT_IDS) store.addNode(id);
    expect(store.getState().added).toHaveLength(8);
  });

  it('removing the selected node falls back to master and keeps playing', () => {
    store.addNode('bass');
    store.removeNode('bass');
    const state = store.getState();
    expect(state.added).toEqual(['master']);
    expect(state.selected).toBe('master');
    expect(state.transport.playing).toBe(true);
  });

  it('removing another node keeps the selection; master cannot be removed', () => {
    store.addNode('bass');
    store.addNode('lead');
    store.removeNode('bass');
    expect(store.getState().selected).toBe('lead');
    store.removeNode('master');
    expect(store.getState().added).toEqual(['master', 'lead']);
  });

  it('only selects nodes that are on the canvas', () => {
    store.selectNode('lfo');
    expect(store.getState().selected).toBe('master');
    store.addNode('lfo');
    store.selectNode('master');
    store.selectNode('lfo');
    expect(store.getState().selected).toBe('lfo');
  });

  it('moves nodes within bounds and never moves master', () => {
    store.addNode('synth');
    store.moveNode('synth', { x: 9999, y: -10 });
    expect(store.getState().positions.synth).toEqual({ x: 752, y: 48 });
    store.moveNode('master', { x: 100, y: 100 });
    expect(store.getState().positions.master).toEqual({ x: 400, y: 175 });
  });

  it('remembers a node position and values after removing and re-adding it', () => {
    store.addNode('synth');
    store.moveNode('synth', { x: 300, y: 300 });
    store.setParam('synth', 'cutoff', 0.9);
    store.removeNode('synth');
    store.addNode('synth');
    expect(store.getState().positions.synth).toEqual({ x: 300, y: 300 });
    expect(store.getState().params.synth.cutoff).toBe(0.9);
  });

  it('clamps params to 0..1 and ignores unknown params', () => {
    store.setParam('synth', 'cutoff', 3);
    expect(store.getState().params.synth.cutoff).toBe(1);
    store.setParam('synth', 'chaos', -1);
    expect(store.getState().params.synth.chaos).toBe(0);
    const before = store.getState();
    store.setParam('synth', 'nope', 0.5);
    expect(store.getState()).toBe(before);
  });

  it('toggles pattern steps', () => {
    expect(store.getState().patterns.bass[0]?.[1]).toBe(false);
    store.toggleStep('bass', 0, 1);
    expect(store.getState().patterns.bass[0]?.[1]).toBe(true);
  });

  describe('DRUM', () => {
    it('starts with the prototype pattern, seed and the 909 kit', () => {
      const { drum } = store.getState();
      expect(drum.kit).toBe('909samples');
      expect(drum.seed).toBe(INITIAL_SEED);
      expect(drum.generation).toBe(0);
      expect(gridFromPattern(drum.pattern)).toEqual(DEFAULT_PATTERNS.drum);
    });

    it('toggles a step by hand without changing the generation', () => {
      store.toggleDrumStep(0, 1);
      const { drum } = store.getState();
      expect(drum.pattern[0]?.[1]).toEqual([MANUAL_HIT]);
      expect(drum.generation).toBe(0);
      store.toggleDrumStep(0, 1);
      expect(store.getState().drum.pattern[0]?.[1]).toEqual([]);
    });

    it('rolls the dice: new seed, new generation, pattern from that seed and CAOS', () => {
      store.rollDice(1234);
      const { drum, params } = store.getState();
      expect(drum.seed).toBe(1234);
      expect(drum.generation).toBe(1);
      expect(drum.pattern).toEqual(generateDrumPattern(1234, params.drum.chaos!));
    });

    it('regenerates from the same seed when CAOS moves', () => {
      store.rollDice(99);
      store.setParam('drum', 'chaos', 0.9);
      const { drum } = store.getState();
      expect(drum.seed).toBe(99);
      expect(drum.generation).toBe(2);
      expect(drum.pattern).toEqual(generateDrumPattern(99, 0.9));
    });

    it('does not regenerate on other knobs, nor on CAOS of other nodes', () => {
      store.setParam('drum', 'kickVolume', 0.3);
      store.setParam('synth', 'chaos', 0.9);
      expect(store.getState().drum.generation).toBe(0);
      expect(store.getState().params.drum.kickVolume).toBe(0.3);
    });

    it('cycles kits once the manifest is known', () => {
      store.nextKit();
      expect(store.getState().drum.kit).toBe('909samples');
      store.setAudioStatus({ ...store.getState().audio, kits: ['909samples', 'glitch', 'trip'] });
      store.nextKit();
      expect(store.getState().drum.kit).toBe('glitch');
      store.nextKit();
      store.nextKit();
      expect(store.getState().drum.kit).toBe('909samples');
    });
  });

  it('nudges bpm by 1 within 40–300', () => {
    store.nudgeBpm(1);
    expect(store.getState().transport.bpm).toBe(121);
    store.nudgeBpm(-1);
    store.nudgeBpm(-1);
    expect(store.getState().transport.bpm).toBe(119);
    for (let i = 0; i < 300; i++) store.nudgeBpm(1);
    expect(store.getState().transport.bpm).toBe(300);
    for (let i = 0; i < 300; i++) store.nudgeBpm(-1);
    expect(store.getState().transport.bpm).toBe(40);
  });

  it('sets bpm directly, rounded and clamped, ignoring non-numbers', () => {
    store.setBpm(133);
    expect(store.getState().transport.bpm).toBe(133);
    store.setBpm(97.6);
    expect(store.getState().transport.bpm).toBe(98);
    store.setBpm(10);
    expect(store.getState().transport.bpm).toBe(40);
    store.setBpm(1000);
    expect(store.getState().transport.bpm).toBe(300);
    store.setBpm(Number.NaN);
    expect(store.getState().transport.bpm).toBe(300);
  });

  it('tracks the playhead only while playing and resets it on stop', () => {
    store.setStep(3);
    expect(store.getState().transport.step).toBe(-1);
    store.togglePlay();
    store.setStep(3);
    expect(store.getState().transport.step).toBe(3);
    store.togglePlay();
    expect(store.getState().transport).toMatchObject({ playing: false, step: -1 });
  });

  it('clamps the drone pad and stores the distortion type', () => {
    store.setDronePosition({ x: 2, y: -1 });
    expect(store.getState().drone).toEqual({ x: 1, y: 0 });
    store.setDistType('crush');
    expect(store.getState().distType).toBe('crush');
  });

  it('notifies subscribers on change and stops after unsubscribing', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.addNode('synth');
    expect(listener).toHaveBeenCalledTimes(1);
    store.addNode('synth'); // no-op
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.addNode('drum');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('Activity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lights a node for the given time', () => {
    const activity = new Activity();
    activity.pulse('drum', 170);
    expect(activity.getState().has('drum')).toBe(true);
    vi.advanceTimersByTime(169);
    expect(activity.getState().has('drum')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(activity.getState().has('drum')).toBe(false);
  });

  it('restarts the timer when pulsed again', () => {
    const activity = new Activity();
    activity.pulse('lead', 200);
    vi.advanceTimersByTime(150);
    activity.pulse('lead', 200);
    vi.advanceTimersByTime(150);
    expect(activity.getState().has('lead')).toBe(true);
    vi.advanceTimersByTime(50);
    expect(activity.getState().has('lead')).toBe(false);
  });

  it('publishes a new snapshot only when the lit set changes', () => {
    const activity = new Activity();
    const listener = vi.fn();
    activity.subscribe(listener);
    activity.pulse('synth', 100);
    const first = activity.getState();
    activity.pulse('synth', 100);
    expect(activity.getState()).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
