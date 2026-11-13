import { describe, expect, it, vi } from 'vitest';
import { LookaheadScheduler } from '../../src/core/scheduler';

const steps = (scheduler: LookaheadScheduler, now: number) => scheduler.advance(now).map((s) => s.step);

describe('LookaheadScheduler', () => {
  describe('without lookahead (steps as they become due)', () => {
    it('emits step 0 at start and then one step per sixteenth', () => {
      const clock = new LookaheadScheduler(120);
      clock.start(10);
      expect(steps(clock, 10)).toEqual([0]);
      expect(steps(clock, 10.1)).toEqual([]);
      expect(steps(clock, 10.13)).toEqual([1]);
      expect(steps(clock, 10.26)).toEqual([2]);
      expect(steps(clock, 10.45)).toEqual([3]); // 0.075 s late: still playable
      expect(steps(clock, 10.5)).toEqual([4]);
    });

    it('drops a step more than 0.1 s late instead of playing it late', () => {
      const clock = new LookaheadScheduler(120);
      clock.start(0);
      expect(steps(clock, 0)).toEqual([0]);
      // Step 1 (0.125) is 0.135 s late at 0.26; step 2 (0.25) is still in time.
      expect(steps(clock, 0.26)).toEqual([2]);
    });

    it('does not drift with irregular polling', () => {
      const clock = new LookaheadScheduler(120);
      clock.start(0);
      let count = 0;
      for (let t = 0; t <= 4; t += 0.0171) count += clock.advance(t).length;
      // 4 s at 120 bpm = 32 steps (step 0 at t=0, the last one lands just before 4 s).
      expect(count).toBe(32);
    });

    it('wraps after 16 steps and counts bars', () => {
      // No lateness limit, so one big jump hands out every step in between.
      const clock = new LookaheadScheduler(120, { maxLateness: Infinity });
      clock.start(0);
      const all = clock.advance(17 * 0.125 + 0.001);
      expect(all.map((s) => s.step).slice(14)).toEqual([14, 15, 0, 1]);
      expect(all[15]!.bar).toBe(0);
      expect(all[16]!.bar).toBe(1);
    });

    it('emits nothing while stopped', () => {
      const clock = new LookaheadScheduler();
      expect(clock.advance(5)).toEqual([]);
      clock.start(0);
      clock.stop(0);
      expect(clock.running).toBe(false);
      expect(clock.advance(5)).toEqual([]);
    });
  });

  describe('with lookahead', () => {
    it('hands out steps ahead of time, each with its exact start time', () => {
      const clock = new LookaheadScheduler(120, { lookahead: 0.1 });
      clock.start(1);
      // At 1.0 the window reaches 1.1: only step 0 (1.125 is outside).
      expect(clock.advance(1)).toEqual([{ step: 0, bar: 0, time: 1, duration: 0.125 }]);
      // At 1.03 the window reaches 1.13: step 1 at 1.125.
      const [next] = clock.advance(1.03);
      expect(next).toMatchObject({ step: 1, time: 1.125 });
    });

    it('never hands out the same step twice', () => {
      const clock = new LookaheadScheduler(120, { lookahead: 0.1 });
      clock.start(0);
      const seen: number[] = [];
      for (let t = 0; t < 2; t += 0.011) seen.push(...clock.advance(t).map((s) => s.time));
      expect(new Set(seen).size).toBe(seen.length);
      // Consecutive and evenly spaced.
      seen.forEach((time, i) => expect(time).toBeCloseTo(i * 0.125, 9));
    });

    it('applies a tempo change from the next step', () => {
      const clock = new LookaheadScheduler(120, { lookahead: 0.1 });
      clock.start(0);
      clock.advance(0); // step 0 at 0, next at 0.125
      clock.setBpm(60);
      const [one] = clock.advance(0.03); // step 1 at 0.125, now 0.25 long
      expect(one).toMatchObject({ step: 1, time: 0.125, duration: 0.25 });
      expect(clock.advance(0.2)).toEqual([]);
      expect(clock.advance(0.28)[0]).toMatchObject({ step: 2, time: 0.375 });
    });

    it('clamps the tempo to the allowed range', () => {
      const clock = new LookaheadScheduler(999);
      expect(clock.tempo).toBe(300);
      clock.setBpm(1);
      expect(clock.tempo).toBe(40);
    });
  });

  describe('late steps', () => {
    it('skips steps it is too late to play, keeping the grid in phase', () => {
      const clock = new LookaheadScheduler(120, { lookahead: 0.1, maxLateness: 0.1 });
      clock.start(0);
      clock.advance(0);
      // Frozen tab: 10 s later. Nothing older than 0.1 s comes out, and times stay on the grid.
      const due = clock.advance(10);
      expect(due.length).toBeGreaterThan(0);
      for (const s of due) {
        expect(s.time).toBeGreaterThanOrEqual(10 - 0.1);
        expect((s.time / 0.125) % 1).toBeCloseTo(0, 6);
        expect(s.step).toBe(Math.round(s.time / 0.125) % 16);
      }
    });
  });

  describe('changes at the next bar', () => {
    it('runs a queued change right before step 0 of the next bar, with its time', () => {
      const clock = new LookaheadScheduler(120, { lookahead: 0.1 });
      clock.start(0);
      clock.advance(0.5); // steps 0..4 handed out
      const change = vi.fn();
      expect(clock.atNextBar(change)).toBe(true);

      clock.advance(1.85); // up to step 15 (1.875 is outside the window)
      expect(change).not.toHaveBeenCalled();
      const [first] = clock.advance(1.9); // bar 1 starts at 2.0
      expect(first).toMatchObject({ step: 0, bar: 1, time: 2 });
      expect(change).toHaveBeenCalledOnce();
      expect(change).toHaveBeenCalledWith(2);
    });

    it('runs each queued change once', () => {
      const clock = new LookaheadScheduler(120);
      clock.start(0);
      clock.advance(0.1);
      const a = vi.fn();
      const b = vi.fn();
      clock.atNextBar(a);
      clock.atNextBar(b);
      clock.advance(4.1); // two more bars
      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });

    it('refuses to queue while stopped, so the caller applies at once', () => {
      const clock = new LookaheadScheduler();
      expect(clock.atNextBar(vi.fn())).toBe(false);
    });

    it('applies queued changes at once when stopped', () => {
      const clock = new LookaheadScheduler(120);
      clock.start(0);
      clock.advance(0.3);
      const change = vi.fn();
      clock.atNextBar(change);
      clock.stop(0.31);
      expect(change).toHaveBeenCalledWith(0.31);
    });
  });
});
