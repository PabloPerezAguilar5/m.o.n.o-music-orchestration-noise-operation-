import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_DELAY_MS, holdRepeat, MIN_INTERVAL_MS, repeatDelay } from '../../src/ui/hold-repeat';

describe('repeatDelay', () => {
  it('waits before repeating, then gets faster down to a floor', () => {
    expect(repeatDelay(0)).toBe(HOLD_DELAY_MS);
    for (let n = 1; n < 40; n++) {
      expect(repeatDelay(n + 1)).toBeLessThanOrEqual(repeatDelay(n));
      expect(repeatDelay(n)).toBeLessThan(HOLD_DELAY_MS);
    }
    expect(repeatDelay(2)).toBeLessThan(repeatDelay(1));
    expect(repeatDelay(100)).toBe(MIN_INTERVAL_MS);
  });
});

describe('holdRepeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once on press and nothing more on a short tap', () => {
    const action = vi.fn();
    const stop = holdRepeat(action);
    expect(action).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HOLD_DELAY_MS - 1);
    stop();
    vi.advanceTimersByTime(5000);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('repeats while held, more often the longer it is held', () => {
    const action = vi.fn();
    const stop = holdRepeat(action);
    vi.advanceTimersByTime(1000);
    const firstSecond = action.mock.calls.length;
    vi.advanceTimersByTime(1000);
    const secondSecond = action.mock.calls.length - firstSecond;
    stop();
    expect(firstSecond).toBeGreaterThan(2);
    expect(secondSecond).toBeGreaterThan(firstSecond * 2);
    // By then it runs at full speed.
    expect(secondSecond).toBeGreaterThanOrEqual(1000 / MIN_INTERVAL_MS - 1);
  });

  it('stops for good when released', () => {
    const action = vi.fn();
    const stop = holdRepeat(action);
    vi.advanceTimersByTime(1500);
    stop();
    const count = action.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(action).toHaveBeenCalledTimes(count);
  });
});
