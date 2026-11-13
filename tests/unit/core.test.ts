import { describe, expect, it } from 'vitest';
import { pulsesAt } from '../../src/core/activity';
import { DEFAULT_BASS_PATTERN, gridFromBassPattern } from '../../src/core/bass-patterns';
import { DEFAULT_SYNTH_PATTERN, gridFromSynthPattern } from '../../src/core/synth-patterns';
import { clampNodePosition, DEFAULT_POSITIONS, MASTER_POSITION } from '../../src/core/geometry';
import { INSTRUMENT_IDS, isSequenced, NODE_IDS, NODE_SPECS, type NodeId } from '../../src/core/nodes';
import { DEFAULT_PATTERNS, hasHitAt, STEPS, toggleStep } from '../../src/core/patterns';
import { clampBpm, parseBpm, stepDuration } from '../../src/core/transport';

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
    expect(DEFAULT_PATTERNS.drum).toHaveLength(NODE_SPECS.drum.rows.length);
    for (const row of DEFAULT_PATTERNS.drum) expect(row).toHaveLength(STEPS);
    // BASS and SYNTH have their own pattern types; their grid views have one row per spec row.
    expect(gridFromBassPattern(DEFAULT_BASS_PATTERN)).toHaveLength(NODE_SPECS.bass.rows.length);
    expect(gridFromSynthPattern(DEFAULT_SYNTH_PATTERN)).toHaveLength(NODE_SPECS.synth.rows.length);
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
    const pattern = DEFAULT_PATTERNS.drum;
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
  it('clamps bpm to 40–300', () => {
    expect(clampBpm(20)).toBe(40);
    expect(clampBpm(40)).toBe(40);
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(300)).toBe(300);
    expect(clampBpm(999)).toBe(300);
  });

  it('parses a typed tempo, clamped, and rejects anything else', () => {
    expect(parseBpm('128')).toBe(128);
    expect(parseBpm(' 95 ')).toBe(95);
    expect(parseBpm('7')).toBe(40);
    expect(parseBpm('999')).toBe(300);
    for (const bad of ['', '  ', 'abc', '12a', '-90', '120.5', '1e2']) {
      expect(parseBpm(bad), bad).toBeNull();
    }
  });

  it('computes sixteenth-note duration', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125);
    expect(stepDuration(60)).toBeCloseTo(0.25);
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
  const ids = (step: number, sounding: NodeId[] = []) =>
    pulsesAt(step, sounding).map((pulse) => pulse.id);

  it('lights DRUM, BASS and SYNTH only when the audio engine says they sounded', () => {
    for (const id of ['drum', 'bass', 'synth'] as const) {
      expect(ids(0)).not.toContain(id);
      expect(ids(1, [id])).toEqual([id]);
    }
    expect(ids(1)).toEqual([]);
  });

  it('lights MASTER on each beat; DISTORSION and LFO are no longer simulated', () => {
    expect(ids(4)).toEqual(['master']);
    // LEAD and DRONE are live: they light up while they sound, never on the clock.
    // DISTORSION lights with what goes through it and the LFO glows with its wave (canvas).
    for (const step of [0, 2, 4, 5]) {
      for (const id of ['drone', 'lead', 'dist', 'lfo'] as const) expect(ids(step)).not.toContain(id);
    }
    expect(ids(2)).not.toContain('master');
  });
});
