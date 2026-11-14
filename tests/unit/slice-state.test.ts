import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_AUDIO_STATUS } from '../../src/core/audio-scene';
import { MACRO_PARAM } from '../../src/core/nodes';
import { DEFAULT_LOOP, DEFAULT_SLICE_PATTERN, sameSlicePattern, slicesOf, type BassLoop } from '../../src/core/slice';
import { sceneFromState } from '../../src/state/scene';
import { Store } from '../../src/state/store';

const LINE_A: BassLoop = { set: 'line', file: 'a-128-a.wav', variant: 'a', bars: 1, bpm: 128, key: 'A' };
const ARP_C: BassLoop = { set: 'arp', file: 'a-128-c.wav', variant: 'a', bars: 4, bpm: 128, key: 'C' };

describe('SLICE state', () => {
  let store: Store;
  const slice = () => store.getState().bass.slice;
  const seeds = (() => {
    let next = 7;
    return () => (next += 1) * 2654435761;
  })();

  beforeEach(() => {
    store = new Store();
  });

  it('starts in SYNTH, on the whole original line in C, synced, bar 1', () => {
    const { bass } = store.getState();
    expect(bass.voice).toBe('synth');
    expect(bass.slice).toMatchObject({ category: 'line', loop: DEFAULT_LOOP, bar: 0, sync: true, reverse: false, mode: 'original' });
    expect(bass.slice.pattern).toEqual(DEFAULT_SLICE_PATTERN);
    expect(store.getState().params.bass).toMatchObject({ sliceVolume: 0.8, sliceFilter: 1, sliceDrive: 0, slicePitch: 0.5, sliceGate: 1 });
  });

  it('each voice keeps its own pattern across the switch', () => {
    const line = store.getState().bass.pattern;
    store.setBassVoice('slice');
    store.assignSliceStep(0, 5);
    const pieces = slice().pattern;
    store.setBassVoice('synth');
    expect(store.getState().bass.pattern).toBe(line);
    store.setBassVoice('slice');
    expect(slice().pattern).toBe(pieces);
  });

  it('picking a loop shows its set; picking a set alone keeps the loop', () => {
    store.setSliceCategory('arp');
    expect(slice()).toMatchObject({ category: 'arp', loop: DEFAULT_LOOP });
    store.selectLoop(ARP_C);
    expect(slice()).toMatchObject({ category: 'arp', loop: { set: 'arp', file: 'a-128-c.wav' } });
    store.setSliceCategory('sweep');
    expect(slice().loop).toEqual({ set: 'arp', file: 'a-128-c.wav' });
  });

  it('BAR takes 1..4 or AUTO and refuses the rest', () => {
    store.setSliceBar(3);
    expect(slice().bar).toBe(3);
    store.setSliceBar('auto');
    expect(slice().bar).toBe('auto');
    store.setSliceBar(4);
    store.setSliceBar(-1);
    store.setSliceBar(1.5);
    expect(slice().bar).toBe('auto');
  });

  it('SYNC and REVERSE toggle', () => {
    store.toggleSliceSync();
    store.toggleSliceReverse();
    expect(slice()).toMatchObject({ sync: false, reverse: true });
  });

  it('assigning a piece is a hand edit: the generation stays', () => {
    store.assignSliceStep(2, 9);
    expect(slice().generation).toBe(0);
    expect(slicesOf(slice().pattern)[2]).toBe(9);
    store.assignSliceStep(2, 9);
    expect(slicesOf(slice().pattern)[2]).toBe(-1);
  });

  it('DICE always gives a different pattern, in the current style, bumping the generation', () => {
    let previous = slice().pattern;
    for (let press = 0; press < 6; press++) {
      store.randomizeSlice(seeds);
      expect(sameSlicePattern(slice().pattern, previous)).toBe(false);
      expect(slice().generation).toBe(press + 1);
      previous = slice().pattern;
    }
    expect(slice().mode).toBe('original');
  });

  it('a DICE style regenerates with the same seed; CAOS too, only while SLICE plays', () => {
    const seed = slice().seed;
    store.setSliceMode('shuffle');
    expect(slice()).toMatchObject({ mode: 'shuffle', seed, generation: 1 });
    const shuffled = slice().pattern;

    // In SYNTH, CAOS regenerates the 303 line and leaves the pieces alone.
    store.setParam('bass', MACRO_PARAM, 0.9);
    expect(slice().pattern).toBe(shuffled);
    expect(store.getState().bass.generation).toBe(1);

    store.setBassVoice('slice');
    store.setParam('bass', MACRO_PARAM, 0.3);
    expect(slice()).toMatchObject({ seed, generation: 2 });
    expect(slice().pattern).not.toBe(shuffled);
    expect(store.getState().bass.generation).toBe(1);
  });

  it('BORRAR in SLICE switches every step off and keeps the 303 line', () => {
    const line = store.getState().bass.pattern;
    store.setBassVoice('slice');
    store.clearPattern('bass');
    expect(slice().pattern.every((step) => !step.on)).toBe(true);
    expect(store.getState().bass.pattern).toBe(line);
  });

  it('the scene carries the voice, the knobs and the loop once the manifest is in', () => {
    store.setBassVoice('slice');
    store.selectLoop(LINE_A);
    let scene = sceneFromState(store.getState());
    expect(scene.bass.voice).toBe('slice');
    expect(scene.bass.slice.loop).toBeNull(); // no manifest yet
    store.setAudioStatus({ ...INITIAL_AUDIO_STATUS, loops: [LINE_A, ARP_C] });
    scene = sceneFromState(store.getState());
    expect(scene.bass.slice).toMatchObject({ loop: LINE_A, bar: 0, sync: true, volume: 0.8, filter: 1, pitch: 0.5, gate: 1 });
  });

  it('is plain data: it survives a trip through JSON', () => {
    store.setBassVoice('slice');
    store.selectLoop(ARP_C);
    store.setSliceBar('auto');
    store.toggleSliceReverse();
    store.setSliceMode('stutter');
    store.assignSliceStep(4, 1);
    const { bass } = store.getState();
    expect(JSON.parse(JSON.stringify(bass))).toEqual(bass);
  });
});
