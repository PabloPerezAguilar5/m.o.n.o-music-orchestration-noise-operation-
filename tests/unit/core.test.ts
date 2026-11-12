import { describe, expect, it } from 'vitest';
import { pulsesAt } from '../../src/core/activity';
import { clampNodePosition, DEFAULT_POSITIONS, MASTER_POSITION } from '../../src/core/geometry';
import { INSTRUMENT_IDS, isSequenced, NODE_IDS, NODE_SPECS } from '../../src/core/nodes';
import { DEFAULT_PATTERNS, hasHitAt, STEPS, toggleStep } from '../../src/core/patterns';
import { clampBpm, StepClock, stepDuration } from '../../src/core/transport';

describe('nodes', () => {
  it('has seven instrument types plus master', () => {
    expect(NODE_IDS).toHaveLength(8);
    expect(INSTRUMENT_IDS).toHaveLength(7);
    expect(INSTRUMENT_IDS).not.toContain('master');
  });

  it('gives every sequenced node pattern rows and no one else', () => {
    for (const id of NODE_IDS) {
      const sequenced = NODE_SPECS[id].zone === 'sequencer';
      expect(isSequenced(id)).toBe(sequenced);
      expect(NODE_SPECS[id].rows.length > 0).toBe(sequenced);
    }
  });
});

describe('patterns', () => {
  it('ships 16-step defaults matching each node spec', () => {
    for (const id of ['synth', 'drum', 'bass'] as const) {
      expect(DEFAULT_PATTERNS[id]).toHaveLength(NODE_SPECS[id].rows.length);
      for (const row of DEFAULT_PATTERNS[id]) expect(row).toHaveLength(STEPS);
    }
  });

  it('toggles one step without mutating the original', () => {
    const before = DEFAULT_PATTERNS.drum;
    const after = toggleStep(before, 0, 1);
    expect(after[0]?.[1]).toBe(true);
    expect(before[0]?.[1]).toBe(false);
    expect(after[1]).toBe(before[1]);
    expect(toggleStep(after, 0, 1)).toEqual(before);
  });

  it('ignores coordinates outside the pattern', () => {
    const pattern = DEFAULT_PATTERNS.bass;
    expect(toggleStep(pattern, 9, 0)).toBe(pattern);
    expect(toggleStep(pattern, 0, 16)).toBe(pattern);
    expect(toggleStep(pattern, 0, -1)).toBe(pattern);
  });

  it('detects hits on a step across rows', () => {
    expect(hasHitAt(DEFAULT_PATTERNS.drum, 0)).toBe(true); // kick
    expect(hasHitAt(DEFAULT_PATTERNS.drum, 7)).toBe(true); // perc only
    expect(hasHitAt(DEFAULT_PATTERNS.drum, 1)).toBe(false);
  });
});

describe('transport', () => {
  it('clamps bpm to 60–200', () => {
    expect(clampBpm(20)).toBe(60);
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(999)).toBe(200);
  });

  it('computes sixteenth-note duration', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125);
    expect(stepDuration(60)).toBeCloseTo(0.25);
  });

  it('emits step 0 at start and then one step per duration', () => {
    const clock = new StepClock(120);
    clock.start(10);
    expect(clock.advance(10)).toEqual([0]);
    expect(clock.advance(10.1)).toEqual([]);
    expect(clock.advance(10.13)).toEqual([1]);
    expect(clock.advance(10.38)).toEqual([2, 3]);
  });

  it('does not drift with irregular polling', () => {
    const clock = new StepClock(120);
    clock.start(0);
    let count = 0;
    for (let t = 0; t <= 4; t += 0.0171) count += clock.advance(t).length;
    // 4 s at 120 bpm = 32 steps (step 0 at t=0, the last one lands just before 4 s).
    expect(count).toBe(32);
  });

  it('wraps after 16 steps', () => {
    const clock = new StepClock(120);
    clock.start(0);
    const steps: number[] = [];
    for (let i = 0; i <= 17; i++) steps.push(...clock.advance(i * 0.125 + 0.001));
    expect(steps.slice(0, 3)).toEqual([0, 1, 2]);
    expect(steps.slice(15, 18)).toEqual([15, 0, 1]);
  });

  it('applies a bpm change from the next step', () => {
    const clock = new StepClock(120);
    clock.start(0);
    expect(clock.advance(0)).toEqual([0]); // next due at 0.125
    clock.setBpm(60);
    expect(clock.advance(0.13)).toEqual([1]); // next due at 0.125 + 0.25
    expect(clock.advance(0.3)).toEqual([]);
    expect(clock.advance(0.38)).toEqual([2]);
  });

  it('skips the backlog after a long pause but keeps the phase', () => {
    const clock = new StepClock(120);
    clock.start(0);
    clock.advance(0);
    // 10 s later: 80 steps elapsed. 80 % 16 = 0, so step 0 is the current one.
    const due = clock.advance(10.001);
    expect(due.length).toBeLessThanOrEqual(2);
    expect(due.at(-1)).toBe(0);
  });

  it('emits nothing while stopped', () => {
    const clock = new StepClock();
    expect(clock.advance(5)).toEqual([]);
    clock.start(0);
    clock.stop();
    expect(clock.running).toBe(false);
    expect(clock.advance(5)).toEqual([]);
  });
});

describe('geometry', () => {
  it('clamps node positions to the canvas bounds', () => {
    expect(clampNodePosition({ x: -50, y: 900 })).toEqual({ x: 48, y: 335 });
    expect(clampNodePosition({ x: 5000, y: 0 })).toEqual({ x: 752, y: 48 });
    expect(clampNodePosition({ x: 300, y: 200 })).toEqual({ x: 300, y: 200 });
  });

  it('places master at the centre and every node inside the bounds', () => {
    expect(DEFAULT_POSITIONS.master).toEqual(MASTER_POSITION);
    for (const id of INSTRUMENT_IDS) {
      expect(clampNodePosition(DEFAULT_POSITIONS[id])).toEqual(DEFAULT_POSITIONS[id]);
    }
  });
});

describe('activity', () => {
  const ids = (step: number) => pulsesAt(step, DEFAULT_PATTERNS).map((pulse) => pulse.id);

  it('lights sequenced nodes only where their pattern has a hit', () => {
    expect(ids(0)).toEqual(expect.arrayContaining(['synth', 'drum', 'bass']));
    expect(ids(1)).toEqual([]);
    expect(ids(3)).toEqual(['bass']);
  });

  it('lights master, distortion and drone on each beat and lfo every other step', () => {
    expect(ids(4)).toEqual(expect.arrayContaining(['master', 'dist', 'drone', 'lfo']));
    expect(ids(2)).toContain('lfo');
    expect(ids(2)).not.toContain('master');
    expect(ids(5)).not.toContain('lfo');
  });
});
