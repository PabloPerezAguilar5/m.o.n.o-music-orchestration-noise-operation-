import { describe, expect, it } from 'vitest';
import { DEFAULT_KIT } from '../../src/core/drum-kits';
import { MACRO_PARAM } from '../../src/core/nodes';
import {
  byteLength,
  knownParams,
  MAX_PATCH_BYTES,
  MAX_PATCH_NAME,
  migratePatch,
  parsePatch,
  parsePatchText,
  PATCH_VERSION,
  PatchError,
  patchFileName,
  patchJson,
  type Patch,
} from '../../src/core/patch';
import { DEFAULT_LOOP } from '../../src/core/slice';
import { patchFromState, persistentSlice } from '../../src/state/patch-state';
import { Store } from '../../src/state/store';

const DATE = '2026-11-14T12:00:00.000Z';

/** JSON with object keys sorted, so two equal values read the same whatever their key order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** A store with a bit of everything on the canvas. */
function busyStore(): Store {
  const store = new Store();
  for (const id of ['drum', 'bass', 'synth', 'dist', 'lfo', 'lead', 'drone'] as const) store.addNode(id);
  store.connect('bass', 'dist');
  store.connect('lfo', 'bass');
  store.toggleCable('drum', 'master');
  store.moveNode('synth', { x: 200, y: 100 });
  store.setBpm(133);
  store.nudgeRoot(1);
  store.nudgeRoot(1);
  store.nudgeRoot(1);
  store.nudgeScale(1);
  store.setParam('bass', 'cutoff', 0.8);
  store.setParam('drum', MACRO_PARAM, 0.7);
  store.toggleDrumStep(1, 3);
  store.toggleBassStep(0, 2);
  store.toggleSynthStep(3, 5);
  store.setBassMode('dirty');
  store.toggleBassWave();
  store.toggleBassSub();
  store.setBassVoice('slice');
  store.selectLoop({ set: 'arp', file: 'b-128-e.wav' });
  store.setSliceBar('auto');
  store.toggleSliceReverse();
  store.assignSliceStep(2, 9);
  store.setSynthPreset('glass');
  store.setSynthMode('melody');
  store.nudgeLeadOctave(1);
  store.toggleScaleLock();
  store.setDronePreset('alien');
  store.setDroneMode('hold');
  store.setDistType('crush');
  store.setLfoShape('square');
  store.toggleLfoSync();
  store.toggleMetronome();
  store.setMetronomeVolume(0.3);
  store.togglePlay(); // stopped: transient, must not matter
  return store;
}

const stripGenerations = (slice: readonly unknown[]): string =>
  JSON.stringify(canonical(slice), (key, value: unknown) => (key === 'generation' ? undefined : value));

describe('state → patch → state', () => {
  it('comes back the same (generations aside), as JSON', () => {
    const store = busyStore();
    const patch = patchFromState(store.getState(), 'Todo', DATE);
    const { patch: parsed, warnings } = parsePatch(JSON.parse(patchJson(patch)));
    expect(warnings).toEqual([]);
    expect(parsed).toEqual(patch);

    const fresh = new Store();
    fresh.loadPatch(parsed);
    expect(stripGenerations(persistentSlice(fresh.getState()))).toBe(stripGenerations(persistentSlice(store.getState())));
    expect(patchFromState(fresh.getState(), 'Todo', DATE)).toEqual(patch);
  });

  it('keeps patterns as they are: nothing is regenerated', () => {
    const store = busyStore();
    const patch = patchFromState(store.getState(), 'P', DATE);
    const fresh = new Store();
    fresh.loadPatch(patch);
    expect(fresh.getState().drum.pattern).toEqual(store.getState().drum.pattern);
    expect(fresh.getState().bass.pattern).toEqual(store.getState().bass.pattern);
    expect(fresh.getState().bass.slice.pattern).toEqual(store.getState().bass.slice.pattern);
    expect(fresh.getState().synth.pattern).toEqual(store.getState().synth.pattern);
  });

  it('leaves the transient part alone and moves the generations (the audio takes the patterns at the bar)', () => {
    const store = busyStore();
    const patch = patchFromState(store.getState(), 'P', DATE);
    const target = new Store();
    target.addNode('lead');
    const before = target.getState();
    target.loadPatch(patch);
    const after = target.getState();
    expect(after.transport.playing).toBe(true);
    expect(after.transport.step).toBe(before.transport.step);
    expect(after.audio).toBe(before.audio);
    expect(after.selected).toBe('lead'); // still on the canvas
    expect(after.drum.generation).toBe(before.drum.generation + 1);
    expect(after.bass.generation).toBe(before.bass.generation + 1);
    expect(after.bass.slice.generation).toBe(before.bass.slice.generation + 1);
    expect(after.synth.generation).toBe(before.synth.generation + 1);
  });

  it('falls back to MASTER when the selected node is not in the patch', () => {
    const target = new Store();
    target.addNode('synth');
    target.loadPatch(patchFromState(new Store().getState(), 'vacio', DATE));
    expect(target.getState().selected).toBe('master');
    expect(target.getState().added).toEqual(['master']);
  });

  it('knobs the patch does not name take their defaults, not the previous values', () => {
    const store = new Store();
    store.setParam('bass', 'cutoff', 0.9);
    const patch: Patch = { ...patchFromState(new Store().getState(), 'p', DATE), params: { bass: { resonance: 0.1 } } };
    store.loadPatch(parsePatch(JSON.parse(patchJson(patch))).patch);
    expect(store.getState().params.bass.cutoff).toBe(0.45);
    expect(store.getState().params.bass.resonance).toBe(0.1);
  });
});

describe('the validator against garbage', () => {
  const base = (): Record<string, unknown> => JSON.parse(patchJson(patchFromState(busyStore().getState(), 'ok', DATE)));
  const code = (value: unknown): string => {
    try {
      parsePatch(value);
      return 'ok';
    } catch (error) {
      return error instanceof PatchError ? `${error.code}${error.detail ? ':' + error.detail : ''}` : 'other';
    }
  };

  it('refuses anything that is not a patch object of this version', () => {
    expect(code(null)).toBe('field:patch');
    expect(code('{}')).toBe('field:patch');
    expect(code([])).toBe('field:patch');
    expect(code({})).toBe('version:undefined');
    expect(code({ v: 2 })).toBe('version:2');
    expect(code({ v: '1' })).toBe('version:1');
  });

  it('refuses wrong types, naming the field', () => {
    expect(code({ ...base(), bpm: 'rapido' })).toBe('field:bpm');
    expect(code({ ...base(), bpm: NaN })).toBe('field:bpm');
    expect(code({ ...base(), key: { root: 0, scale: 'blues' } })).toBe('field:key.scale');
    expect(code({ ...base(), key: 'C' })).toBe('field:key');
    expect(code({ ...base(), nodes: 'drum' })).toBe('field:nodes');
    expect(code({ ...base(), params: { bass: { cutoff: 'alto' } } })).toBe('field:params.bass.cutoff');
    expect(code({ ...base(), positions: { bass: { x: 1 } } })).toBe('field:positions.bass.y');
    expect(code({ ...base(), drum: { pattern: [[[{ velocity: true }]]] } })).toBe('field:drum.pattern[0][0][0].velocity');
    expect(code({ ...base(), bass: { pattern: [{ note: 'C' }] } })).toBe('field:bass.pattern[0].note');
    expect(code({ ...base(), bass: { slice: { loop: { set: 'line', file: '../../etc/passwd' } } } })).toBe('field:bass.slice.loop.file');
    expect(code({ ...base(), bass: { slice: { mode: 'x' } } })).toBe('field:bass.slice.mode');
    expect(code({ ...base(), synth: { pattern: [{ notes: 'all' }] } })).toBe('field:synth.pattern[0].notes');
    expect(code({ ...base(), distType: 'fuzz' })).toBe('field:distType');
    expect(code({ ...base(), metronome: { on: 'yes' } })).toBe('field:metronome.on');
    expect(code({ ...base(), cables: [{ from: 'bass' }, 'x'] })).toBe('field:cables[1]');
    expect(code({ ...base(), drum: { kit: 'Bad Kit!' } })).toBe('field:drum.kit');
  });

  it('never reads dangerous keys and leaves Object.prototype alone', () => {
    const evil = JSON.parse(
      '{"v":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"params":{"__proto__":{"x":1},"bass":{"__proto__":{"cutoff":0.1},"cutoff":0.3}},"prototype":1}',
    ) as Record<string, unknown>;
    const { patch } = parsePatch(evil);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(patch)).not.toContain('__proto__');
    expect(Object.keys(patch.params)).toEqual(['bass']);
    expect(patch.params.bass).toEqual({ cutoff: 0.3 });
    expect(Object.getPrototypeOf(patch.params)).toBe(Object.prototype);
  });

  it('drops unknown keys, unknown nodes and unknown knobs', () => {
    const { patch } = parsePatch({
      ...base(),
      extra: 'nope',
      nodes: ['drum', 'piano', 'drum', 'master', 'bass'],
      params: { bass: { cutoff: 0.2, gainz: 9 }, piano: { x: 1 } },
      drum: { ...(base().drum as object), evil: () => 1 },
    });
    expect('extra' in patch).toBe(false);
    expect(patch.nodes).toEqual(['master', 'drum', 'bass']);
    expect(patch.params).toEqual({ bass: { cutoff: 0.2 } });
    expect(Object.keys(patch.drum)).toEqual(['kit', 'seed', 'pattern']);
    for (const id of ['bass', 'drum', 'master'] as const) expect(knownParams(id)).toContain(MACRO_PARAM);
  });

  it('clamps numbers to their range and cuts texts', () => {
    const { patch } = parsePatch({
      ...base(),
      name: 'x'.repeat(100) + '\u0000',
      bpm: 9999,
      key: { root: 40, scale: 'minor' },
      params: { bass: { cutoff: 5, resonance: -2 } },
      positions: { bass: { x: -500, y: 9000 } },
      lead: { octave: 99, scaleLock: false, hold: false },
      metronome: { on: false, volume: 3 },
      bass: { slice: { bar: 7, pattern: [{ slice: 99, on: true, reverse: false }] } },
    });
    expect(patch.name).toHaveLength(MAX_PATCH_NAME);
    expect(patch.bpm).toBe(300);
    expect(patch.key.root).toBe(11);
    expect(patch.params.bass).toEqual({ cutoff: 1, resonance: 0 });
    expect(patch.positions.bass).toEqual({ x: 48, y: 335 });
    expect(patch.lead.octave).toBe(2);
    expect(patch.metronome.volume).toBe(1);
    expect(patch.bass.slice.bar).toBe(3);
    expect(patch.bass.slice.pattern[0]).toEqual({ slice: 15, on: true, reverse: false });
    expect(patch.bass.slice.pattern[1]).toEqual({ slice: 1, on: false, reverse: false }); // padded, off
  });

  it('bounds the patterns: 16 steps, three hits a step, valid velocities, notes and lengths', () => {
    const hits = Array.from({ length: 10 }, () => ({ velocity: 7, offset: 2 }));
    const { patch } = parsePatch({
      ...base(),
      drum: { pattern: [Array.from({ length: 40 }, () => hits)] },
      bass: { pattern: Array.from({ length: 3 }, () => ({ note: 9, length: 99, slide: true, accent: true })) },
      synth: { pattern: [{ notes: [12, 3, 3, -1, 5, 6], length: 5 }] },
    });
    expect(patch.drum.pattern).toHaveLength(4);
    expect(patch.drum.pattern[0]).toHaveLength(16);
    expect(patch.drum.pattern[0]![0]).toEqual(Array(3).fill({ velocity: 1, offset: 0.8 }));
    expect(patch.drum.pattern[1]![0]).toEqual([]);
    expect(patch.bass.pattern).toHaveLength(16);
    expect(patch.bass.pattern[0]).toEqual({ note: 4, length: 16, slide: true, accent: true });
    expect(patch.bass.pattern[3]).toEqual({ note: null, slide: false, accent: false, length: 1 });
    // Three notes at most are read, then clamped and deduplicated: 12 → 9, 3, 3 → 3.
    expect(patch.synth.pattern[0]).toEqual({ notes: [3, 9], length: 1 });
  });

  it('keeps only cables that make sense: known nodes on the canvas, no loops, no input where there is none', () => {
    const { patch } = parsePatch({
      ...base(),
      nodes: ['master', 'bass', 'dist', 'lfo'],
      cables: [
        { from: 'bass', to: 'master', cut: true },
        { from: 'bass', to: 'master' }, // repeated
        { from: 'dist', to: 'dist' }, // loop
        { from: 'master', to: 'bass' }, // MASTER has no output
        { from: 'lfo', to: 'master' }, // the LFO never moves MASTER
        { from: 'bass', to: 'drum' }, // a generator has no input (and DRUM is not on the canvas)
        { from: 'synth', to: 'master' }, // not on the canvas
        { from: 'lfo', to: 'dist' },
        { from: 'dist', to: 'master' },
        { from: 'bass', to: 'dist' },
      ],
    });
    expect(patch.cables).toEqual([
      { from: 'bass', to: 'master', cut: true },
      { from: 'lfo', to: 'dist', cut: false },
      { from: 'dist', to: 'master', cut: false },
      { from: 'bass', to: 'dist', cut: false },
    ]);
  });

  it('a kit or loop the manifests lack becomes the default, with a warning; unknown manifests accept anything well-formed', () => {
    const raw = { ...base(), drum: { kit: 'vinyl' }, bass: { slice: { loop: { set: 'arp', file: 'z-128-c.wav' } } } };
    const lenient = parsePatch(raw);
    expect(lenient.warnings).toEqual([]);
    expect(lenient.patch.drum.kit).toBe('vinyl');
    const strict = parsePatch(raw, { kits: ['samples808', 'glitch'], loops: [{ set: 'arp', file: 'a-128-c.wav' }] });
    expect(strict.warnings).toEqual([
      { kind: 'kit', wanted: 'vinyl' },
      { kind: 'loop', wanted: 'arp/z-128-c.wav' },
    ]);
    expect(strict.patch.drum.kit).toBe(DEFAULT_KIT);
    expect(strict.patch.bass.slice.loop).toEqual(DEFAULT_LOOP);
  });

  it('refuses a text bigger than 200 KB before parsing it, and text that is not JSON', () => {
    const huge = JSON.stringify({ v: 1, name: 'x'.repeat(MAX_PATCH_BYTES) });
    expect(byteLength(huge)).toBeGreaterThan(MAX_PATCH_BYTES);
    expect(() => parsePatchText(huge)).toThrow(/too-big/);
    expect(() => parsePatchText('{"v":1,')).toThrow(/json/);
    expect(() => parsePatchText('<html>')).toThrow(/json/);
    expect(parsePatchText(patchJson(patchFromState(new Store().getState(), 'p', DATE))).patch.name).toBe('p');
  });

  it('a patch with only its version loads: MASTER alone, defaults everywhere, silent patterns', () => {
    const { patch } = parsePatch({ v: 1 });
    const store = new Store();
    store.loadPatch(patch);
    const state = store.getState();
    const initial = new Store().getState();
    expect(state.added).toEqual(['master']);
    expect(state.params).toEqual(initial.params);
    expect(state.positions).toEqual(initial.positions);
    expect(state.transport.bpm).toBe(120);
    expect(state.drum.pattern.every((row) => row.every((hits) => hits.length === 0))).toBe(true);
    expect(state.bass.pattern.every((step) => step.note === null)).toBe(true);
    expect(state.synth.pattern.every((step) => step.notes.length === 0)).toBe(true);
    expect(state.bass.slice.pattern.every((step) => !step.on)).toBe(true);
  });
});

describe('migration', () => {
  it('passes a current patch through and refuses missing, older-without-path or newer versions', () => {
    const current = { v: PATCH_VERSION, name: 'x' };
    expect(migratePatch(current)).toBe(current);
    expect(() => migratePatch({})).toThrow(PatchError);
    expect(() => migratePatch({ v: 0 })).toThrow(/version/);
    expect(() => migratePatch({ v: PATCH_VERSION + 1 })).toThrow(/version/);
    expect(() => migratePatch('x')).toThrow(/not-object/);
  });

  it('walks the migrations one version at a time, each bumping v', () => {
    const steps: string[] = [];
    const migrations = {
      1: (patch: Record<string, unknown>) => {
        steps.push('1→2');
        return { ...patch, v: 2, renamed: patch.name };
      },
      2: (patch: Record<string, unknown>) => {
        steps.push('2→3');
        return { ...patch, v: 3 };
      },
    };
    expect(migratePatch({ v: 1, name: 'old' }, migrations, 3)).toEqual({ v: 3, name: 'old', renamed: 'old' });
    expect(steps).toEqual(['1→2', '2→3']);
    expect(migratePatch({ v: 3 }, migrations, 3)).toEqual({ v: 3 });
    // A gap in the chain, or a step that forgets to bump v, is an error, not a silent pass.
    expect(() => migratePatch({ v: 1 }, { 1: migrations[1] }, 3)).toThrow(/version/);
    expect(() => migratePatch({ v: 1 }, { 1: (p) => p }, 2)).toThrow(/migration from 1/);
  });
});

describe('file name', () => {
  it('comes from the patch name, safe for a file system', () => {
    const patch = patchFromState(new Store().getState(), 'Mi groove / Ñandú #2', DATE);
    expect(patchFileName(patch)).toBe('mi-groove-and-2.mono');
    expect(patchFileName({ ...patch, name: '' })).toBe('patch.mono');
  });
});
