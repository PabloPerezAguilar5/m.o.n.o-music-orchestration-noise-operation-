import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BassTrack, type SynthTrack } from '../../src/audio/bass/bass-track';
import type { SliceHit, SliceModule } from '../../src/audio/bass/slice-module';
import type { VoiceModule } from '../../src/audio/voice/voice-module';
import { INITIAL_AUDIO_STATUS } from '../../src/core/audio-scene';
import { loopId, sliceSeconds, type BassLoop } from '../../src/core/slice';
import { stepDuration } from '../../src/core/transport';
import { sceneFromState } from '../../src/state/scene';
import { Store } from '../../src/state/store';
import { FakeContext, FakeNode } from './fake-audio';

/**
 * BASS as the backend runs it: one module, two voices. The 303 side and the SLICE
 * module are stand-ins that record what the track asks of them.
 */

const LINE: BassLoop = { set: 'line', file: 'a-128-c.wav', variant: 'a', bars: 1, bpm: 128, key: 'C' };
const ARP: BassLoop = { set: 'arp', file: 'a-128-c.wav', variant: 'a', bars: 4, bpm: 128, key: 'C' };
const BUFFER = { duration: 1.875 } as AudioBuffer;
const BUFFER_4 = { duration: 7.5 } as AudioBuffer;

function fakeSlicer() {
  const hits: (SliceHit & { buffer: AudioBuffer | null })[] = [];
  const flushes: number[] = [];
  let buffer: AudioBuffer | null = null;
  const slicer = {
    input: new FakeNode(),
    output: new FakeNode(),
    inputFor: () => new FakeNode(),
    setKnobs: vi.fn(),
    setBuffer: (next: AudioBuffer | null) => {
      buffer = next;
    },
    get hasBuffer() {
      return buffer !== null;
    },
    play: (hit: SliceHit, other?: AudioBuffer | null) => hits.push({ ...hit, buffer: other === undefined ? buffer : other }),
    flush: (time: number) => flushes.push(time),
    cancelAfter: vi.fn(),
    dispose: vi.fn(),
  };
  return { slicer: slicer as unknown as SliceModule, hits, flushes, buffer: () => buffer };
}

function fakeSynth() {
  const played: number[] = [];
  const flushes: number[] = [];
  const module = { output: new FakeNode(), inputFor: () => new FakeNode(), dispose: vi.fn() };
  const synth: SynthTrack = {
    update: vi.fn(),
    pending: () => false,
    commit: vi.fn(),
    create: () => module as unknown as VoiceModule,
    flush: (time) => flushes.push(time),
    drop: vi.fn(),
    play: (step) => {
      played.push(step);
      return step % 2 === 0; // "a note on the even steps"
    },
  };
  return { synth, played, flushes };
}

describe('BassTrack', () => {
  let store: Store;
  let loaded: Map<string, AudioBuffer>;
  let requests: string[];
  let slicer: ReturnType<typeof fakeSlicer>;
  let synth: ReturnType<typeof fakeSynth>;
  let track: BassTrack;
  const context = new FakeContext() as unknown as BaseAudioContext;
  const scene = () => sceneFromState(store.getState());

  beforeEach(() => {
    store = new Store();
    store.setAudioStatus({ ...INITIAL_AUDIO_STATUS, loops: [LINE, ARP] });
    store.addNode('bass');
    loaded = new Map();
    requests = [];
    slicer = fakeSlicer();
    synth = fakeSynth();
    track = new BassTrack(
      { get: (loop) => loaded.get(loopId(loop)), request: (loop) => requests.push(loopId(loop)) },
      () => true,
      () => slicer.slicer,
      synth.synth,
    );
  });

  /** As the backend does: the scene goes in, the module is built, and a bar is committed. */
  function start(): void {
    track.update(scene(), 0);
    track.create(context, scene());
    track.commit(scene(), 0);
  }

  it('in SYNTH the 303 plays and SLICE is silent', () => {
    start();
    expect(track.play(0, 0, 0.125)).toBe(true);
    expect(track.play(1, 0.125, 0.125)).toBe(false);
    expect(synth.played).toEqual([0, 1]);
    expect(slicer.hits).toEqual([]);
    expect(track.sliceBar()).toBeUndefined();
  });

  it('switching to SLICE waits for the bar, then releases the 303 and plays pieces; back again releases the pieces', () => {
    start();
    loaded.set(loopId(LINE), BUFFER);
    store.setBassVoice('slice');
    track.update(scene(), 0.5);
    expect(track.pending(scene())).toBe(true);
    // Until the bar the 303 keeps playing.
    expect(track.play(4, 0.5, 0.125)).toBe(true);
    expect(slicer.hits).toEqual([]);

    track.commit(scene(), 2);
    expect(synth.flushes).toEqual([2]); // nothing left hanging from the 303
    expect(track.play(0, 2, 0.125)).toBe(true);
    expect(synth.played).toEqual([4]); // the 303 is not asked any more
    expect(slicer.hits).toHaveLength(1);
    expect(track.sliceBar()).toBe(0);

    store.setBassVoice('synth');
    track.update(scene(), 3);
    expect(track.pending(scene())).toBe(true);
    track.commit(scene(), 4);
    expect(slicer.flushes).toEqual([4]); // and nothing from SLICE
    expect(track.play(0, 4, 0.125)).toBe(true);
    expect(synth.played).toEqual([4, 0]);
    expect(slicer.hits).toHaveLength(1);
  });

  it('with SYNC at 128 BPM the default pattern plays the file back piece by piece, untouched', () => {
    store.setBpm(128);
    store.setBassVoice('slice');
    loaded.set(loopId(LINE), BUFFER);
    start();
    const duration = stepDuration(128);
    for (let step = 0; step < 16; step++) expect(track.play(step, 10 + step * duration, duration)).toBe(true);
    expect(slicer.hits).toHaveLength(16);
    slicer.hits.forEach((hit, step) => {
      expect(hit.start).toBeCloseTo(step * sliceSeconds(128), 9);
      expect(hit.end - hit.start).toBeCloseTo(sliceSeconds(128), 9);
      expect(hit.rate).toBe(1);
      expect(hit.gate).toBe(1);
      expect(hit.reverse).toBe(false);
      expect(hit.time).toBeCloseTo(10 + step * duration, 9);
      expect(hit.buffer).toBe(BUFFER);
    });
  });

  it('SYNC off, PITCH, GATE and REVERSE apply at once', () => {
    store.setBassVoice('slice');
    loaded.set(loopId(LINE), BUFFER);
    start(); // 120 bpm, sync on
    track.play(0, 0, 0.125);
    expect(slicer.hits.at(-1)!.rate).toBeCloseTo(120 / 128, 9);
    store.toggleSliceSync();
    store.setParam('bass', 'slicePitch', 1);
    store.setParam('bass', 'sliceGate', 0);
    store.toggleSliceReverse();
    track.update(scene(), 0.2);
    track.play(1, 0.125, 0.125);
    const hit = slicer.hits.at(-1)!;
    expect(hit.rate).toBeCloseTo(2, 9);
    expect(hit.gate).toBeCloseTo(0.1, 9);
    expect(hit.reverse).toBe(true);
    expect(slicer.slicer.setKnobs).toHaveBeenCalled();
  });

  it('a loop not decoded yet is requested and nothing plays until it is in; then it switches at the bar', () => {
    store.setBassVoice('slice');
    start();
    expect(requests).toContain('line/a-128-c.wav');
    expect(track.play(0, 0, 0.125)).toBe(false);
    expect(slicer.hits).toEqual([]);

    loaded.set(loopId(LINE), BUFFER);
    expect(track.pending(scene())).toBe(false); // the loop is the one wanted: nothing structural
    expect(track.play(1, 0.125, 0.125)).toBe(true);
    expect(slicer.buffer()).toBe(BUFFER);

    // A new loop: waits for the bar once decoded; the old one keeps playing meanwhile.
    store.selectLoop(ARP);
    track.update(scene(), 0.3);
    expect(track.pending(scene())).toBe(false);
    expect(requests).toContain('arp/a-128-c.wav');
    expect(track.play(2, 0.25, 0.125)).toBe(true);
    expect(slicer.hits.at(-1)!.buffer).toBe(BUFFER);
    loaded.set(loopId(ARP), BUFFER_4);
    expect(track.pending(scene())).toBe(true);
    track.commit(scene(), 2);
    expect(track.play(0, 2, 0.125)).toBe(true);
    expect(slicer.hits.at(-1)!.buffer).toBe(BUFFER_4);
  });

  it('BAR picks the bar of a 4-bar loop at the next bar; AUTO walks through them', () => {
    store.setBassVoice('slice');
    store.selectLoop(ARP);
    loaded.set(loopId(ARP), BUFFER_4);
    start();
    store.setSliceBar(2);
    track.update(scene(), 0);
    expect(track.pending(scene())).toBe(true);
    track.commit(scene(), 0);
    track.play(0, 0, 0.125);
    expect(slicer.hits.at(-1)!.start).toBeCloseTo(2 * 1.875, 9);
    expect(track.sliceBar()).toBe(2);

    store.setSliceBar('auto');
    track.update(scene(), 1);
    track.commit(scene(), 2);
    const bars: number[] = [];
    for (let tick = 0; tick < 16 * 5; tick++) {
      track.play(tick % 16, 2 + tick * 0.125, 0.125);
      if (tick % 16 === 0) bars.push(track.sliceBar()!);
    }
    expect(bars).toEqual([0, 1, 2, 3, 0]);
  });

  it('flush releases both voices and starts AUTO over', () => {
    store.setBassVoice('slice');
    store.selectLoop(ARP);
    store.setSliceBar('auto');
    loaded.set(loopId(ARP), BUFFER_4);
    start();
    for (let tick = 0; tick < 32; tick++) track.play(tick % 16, tick * 0.125, 0.125);
    expect(track.sliceBar()).toBe(1);
    track.flush(5);
    expect(slicer.flushes).toEqual([5]);
    expect(synth.flushes).toEqual([5]);
    track.play(0, 6, 0.125);
    expect(track.sliceBar()).toBe(0);
  });

  it('previews: a piece of the loop that is in, and the first beat of any decoded loop', () => {
    store.setBassVoice('slice');
    loaded.set(loopId(LINE), BUFFER);
    start();
    track.previewSlice(5, 1);
    expect(slicer.hits.at(-1)).toMatchObject({ time: 1, start: 5 * sliceSeconds(128), buffer: BUFFER });
    track.previewLoop(ARP, BUFFER_4, 2);
    expect(slicer.hits.at(-1)).toMatchObject({ time: 2, start: 0, end: 4 * sliceSeconds(128), buffer: BUFFER_4, reverse: false });
  });
});
