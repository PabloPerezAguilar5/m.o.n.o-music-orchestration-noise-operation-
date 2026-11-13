import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioGraph, CABLE_FADE, type AudioModule } from '../../src/audio/graph';
import { FakeContext, FakeModule, FakeNode, reaches, type FakeGain } from './fake-audio';

const asModule = (module: FakeModule): AudioModule => module as unknown as AudioModule;

describe('AudioGraph', () => {
  let context: FakeContext;
  let graph: AudioGraph;
  let drum: FakeModule;
  let master: FakeModule;

  beforeEach(() => {
    vi.useFakeTimers();
    context = new FakeContext();
    graph = new AudioGraph(context as unknown as BaseAudioContext);
    drum = new FakeModule();
    master = new FakeModule();
    graph.add('drum', asModule(drum));
    graph.add('master', asModule(master));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Moves audio time and wall-clock timers forward together, to `time`. */
  const passTime = (time: number): void => {
    vi.advanceTimersByTime((time - context.currentTime) * 1000);
    context.currentTime = time;
  };

  const cableGain = (): FakeGain => context.gains.at(-1)!;

  describe('connect', () => {
    it('wires output → cable gain → input', () => {
      expect(graph.connect('drum', 'master', 1)).toBe(true);
      const cable = cableGain();
      expect(drum.output.connections.has(cable)).toBe(true);
      expect(cable.connections.has(master.input)).toBe(true);
      expect(graph.isConnected('drum', 'master')).toBe(true);
      expect(graph.cableIds()).toEqual(['drum->master']);
    });

    it('stays silent until its time, then fades in', () => {
      graph.connect('drum', 'master', 1);
      const gain = cableGain().gain;
      expect(gain.valueAt(0.5)).toBe(0); // before `time`: no sound leaks through
      expect(gain.valueAt(1)).toBe(0);
      expect(gain.valueAt(1 + CABLE_FADE / 2)).toBeCloseTo(0.5);
      expect(gain.valueAt(1 + CABLE_FADE)).toBe(1);
      expect(gain.valueAt(5)).toBe(1);
    });

    it('is idempotent', () => {
      graph.connect('drum', 'master', 0);
      expect(graph.connect('drum', 'master', 0)).toBe(false);
      expect(context.gains).toHaveLength(1);
    });

    it('uses the target input for that source when it has one', () => {
      const channel = new FakeNode();
      const mixer = Object.assign(new FakeModule(), { inputFor: vi.fn(() => channel) });
      graph.add('mixer', asModule(mixer));
      graph.connect('drum', 'mixer', 0);
      expect(mixer.inputFor).toHaveBeenCalledWith('drum');
      expect(reaches(drum.output, channel)).toBe(true);
      expect(reaches(drum.output, mixer.input)).toBe(false);
    });

    it('refuses to connect a missing module', () => {
      expect(() => graph.connect('drum', 'nope', 0)).toThrow(/missing module/);
    });
  });

  describe('disconnect', () => {
    it('fades out from its time and only then disconnects', () => {
      graph.connect('drum', 'master', 0);
      expect(graph.disconnect('drum', 'master', 2)).toBe(true);
      expect(graph.isConnected('drum', 'master')).toBe(false);

      const cable = cableGain();
      expect(cable.gain.valueAt(2)).toBe(1); // still fully open when the cut begins
      expect(cable.gain.valueAt(2 + CABLE_FADE / 2)).toBeCloseTo(0.5);
      expect(cable.gain.valueAt(2 + CABLE_FADE)).toBe(0);

      // The wires stay in place while it fades: no abrupt cut.
      passTime(2);
      expect(reaches(drum.output, master.input)).toBe(true);
      passTime(2 + CABLE_FADE + 0.1);
      expect(reaches(drum.output, master.input)).toBe(false);
      expect(cable.connections.size).toBe(0);
    });

    it('starts the fade-out from where a fade-in had got to', () => {
      graph.connect('drum', 'master', 1);
      graph.disconnect('drum', 'master', 1 + CABLE_FADE / 2);
      const gain = cableGain().gain;
      expect(gain.valueAt(1 + CABLE_FADE / 2)).toBeCloseTo(0.5);
      expect(gain.valueAt(1 + CABLE_FADE)).toBeCloseTo(0.25);
      expect(gain.valueAt(1 + CABLE_FADE * 1.5)).toBe(0);
    });

    it('is a no-op without a cable', () => {
      expect(graph.disconnect('drum', 'master', 0)).toBe(false);
    });

    it('can reconnect at once; the old cable fades out on its own', () => {
      graph.connect('drum', 'master', 0);
      const old = cableGain();
      graph.disconnect('drum', 'master', 1);
      graph.connect('drum', 'master', 1);
      const fresh = cableGain();
      expect(fresh).not.toBe(old);
      passTime(2);
      expect(old.connections.size).toBe(0);
      expect(drum.output.connections.has(fresh)).toBe(true);
      expect(graph.isConnected('drum', 'master')).toBe(true);
    });
  });

  describe('modules', () => {
    it('removing a module cuts its cables and disposes it after the fade', () => {
      graph.connect('drum', 'master', 0);
      graph.remove('drum', 3);
      expect(graph.has('drum')).toBe(false);
      expect(graph.isConnected('drum', 'master')).toBe(false);
      expect(drum.disposed).toBe(false);
      passTime(3 + CABLE_FADE + 0.1);
      expect(drum.disposed).toBe(true);
      expect(master.disposed).toBe(false);
    });

    it('rejects two modules with the same id', () => {
      expect(() => graph.add('drum', asModule(new FakeModule()))).toThrow(/already/);
    });

    it('a removed module can be added again, with a new cable', () => {
      graph.connect('drum', 'master', 0);
      graph.remove('drum', 1);
      const again = new FakeModule();
      graph.add('drum', asModule(again));
      graph.connect('drum', 'master', 2);
      expect(reaches(again.output, master.input)).toBe(true);
      expect(graph.cableIds()).toEqual(['drum->master']);
    });
  });
});
