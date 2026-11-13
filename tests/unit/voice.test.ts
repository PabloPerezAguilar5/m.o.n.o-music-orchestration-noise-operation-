import { describe, expect, it } from 'vitest';
import { bassParamsFromScene, createBassEngine } from '../../src/audio/bass/bass-voice';
import { createSynthEngine, synthParamsFromScene, SYNTH_VOICES } from '../../src/audio/synth/synth-voice';
import { polyBlep, softClip } from '../../src/audio/voice/dsp-math';
import type { EngineParams, VoiceEngine } from '../../src/audio/voice/engine';
import { ENGINES } from '../../src/audio/voice/instruments';
import type { BassScene, SynthScene } from '../../src/core/audio-scene';
import { DEFAULT_BASS_PATTERN } from '../../src/core/bass-patterns';
import { midiToHz } from '../../src/core/scales';
import { DEFAULT_SYNTH_PATTERN } from '../../src/core/synth-patterns';
import { SYNTH_PRESETS } from '../../src/core/synth-voices';

const RATE = 48000;

const render = (engine: VoiceEngine, seconds: number): Float32Array => {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i += 128) engine.render(out, i, Math.min(out.length, i + 128));
  return out;
};
const rms = (x: Float32Array) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / Math.max(1, x.length));
const peak = (x: Float32Array) => x.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
/** High-frequency share of a signal: energy of its slope over its energy. */
const brightness = (x: Float32Array) => rms(x.subarray(1).map((v, i) => v - x[i]!)) / rms(x);

const bassScene = (over: Partial<BassScene> = {}): BassScene => ({
  generation: 0,
  pattern: DEFAULT_BASS_PATTERN,
  mode: 'pulse',
  root: 0,
  scale: 'pentaMinor',
  cutoff: 0.45,
  resonance: 0.55,
  decay: 0.45,
  drive: 0.3,
  wave: 'saw',
  sub: false,
  slides: true,
  ...over,
});

const synthScene = (over: Partial<SynthScene> = {}): SynthScene => ({
  generation: 0,
  pattern: DEFAULT_SYNTH_PATTERN,
  preset: 'pluck',
  root: 0,
  scale: 'pentaMinor',
  wave: 0.35,
  cutoff: 0.55,
  resonance: 0.3,
  attack: 0.05,
  release: 0.35,
  detune: 0.4,
  ...over,
});

const bass = (over: Partial<BassScene> = {}, raw: Partial<EngineParams> = {}) => {
  const engine = createBassEngine(RATE);
  engine.setParams({ ...bassParamsFromScene(bassScene(over)), ...raw });
  return engine;
};
const synth = (over: Partial<SynthScene> = {}, raw: Partial<EngineParams> = {}) => {
  const engine = createSynthEngine(RATE);
  engine.setParams({ ...synthParamsFromScene(synthScene(over)), ...raw });
  return engine;
};

describe('shared DSP pieces', () => {
  it('PolyBLEP corrects only near a discontinuity; softClip is a bounded tanh', () => {
    const dt = 0.01;
    expect(polyBlep(0.5, dt)).toBe(0);
    expect(polyBlep(0, dt)).toBe(-1);
    expect(polyBlep(0.999999, dt)).toBeCloseTo(1, 3);
    expect(softClip(0)).toBe(0);
    expect(softClip(10)).toBe(1);
    expect(softClip(0.5)).toBeCloseTo(Math.tanh(0.5), 2);
  });

  it('BASS and SYNTH are the same engine with two designs', () => {
    expect(ENGINES.bass(RATE).constructor).toBe(ENGINES.synth(RATE).constructor);
  });
});

describe('BASS voice (303)', () => {
  it('is silent until a note, then sounds, bounded and finite', () => {
    const engine = bass();
    expect(peak(render(engine, 0.05))).toBe(0);
    engine.noteOn(1, 36, false, false);
    const out = render(engine, 0.3);
    expect(rms(out)).toBeGreaterThan(0.01);
    expect(peak(out)).toBeLessThan(1);
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it('stays bounded at full resonance and drive, saw and square, with sub', () => {
    for (const wave of ['saw', 'square'] as const) {
      const engine = bass({ cutoff: 1, resonance: 1, drive: 1, sub: true, wave, mode: 'chaos' });
      engine.noteOn(1, 48, true, false);
      const out = render(engine, 0.5);
      expect(out.every(Number.isFinite)).toBe(true);
      expect(peak(out)).toBeLessThan(1);
    }
  });

  it('releases after note off; a stale note-off does not cut a newer note', () => {
    const engine = bass();
    engine.noteOn(1, 36, false, false);
    render(engine, 0.1);
    engine.noteOn(2, 38, false, false);
    engine.noteOff(1); // stale
    expect(rms(render(engine, 0.05))).toBeGreaterThan(0.01);
    engine.noteOff(2);
    render(engine, 0.1);
    expect(engine.sounding).toBe(false);
    expect(peak(render(engine, 0.05))).toBeLessThan(1e-3);
  });

  it('accent is louder and brighter', () => {
    const play = (accent: boolean) => {
      const engine = bass({ cutoff: 0.3, resonance: 0.2, drive: 0 });
      engine.noteOn(1, 36, accent, false);
      return render(engine, 0.08);
    };
    expect(rms(play(true))).toBeGreaterThan(rms(play(false)) * 1.2);
    expect(brightness(play(true))).toBeGreaterThan(brightness(play(false)));
  });

  it('slide glides the pitch over a few tens of ms; a normal note jumps', () => {
    const engine = bass();
    engine.noteOn(1, 36, false, false);
    render(engine, 0.05);
    engine.noteOn(2, 48, false, true);
    render(engine, 0.01);
    expect(engine.frequency).toBeGreaterThan(midiToHz(36) * 1.05);
    expect(engine.frequency).toBeLessThan(midiToHz(48) * 0.95);
    render(engine, 0.2);
    expect(engine.frequency).toBeCloseTo(midiToHz(48), 0);

    const jump = bass();
    jump.noteOn(1, 36, false, false);
    render(jump, 0.05);
    jump.noteOn(2, 48, false, false);
    expect(jump.frequency).toBeCloseTo(midiToHz(48), 6);
  });

  it('legato keeps the envelopes; a retrigger reopens the filter', () => {
    const after = (legato: boolean) => {
      const engine = bass({ cutoff: 0.2, resonance: 0, decay: 0.1, drive: 0 }, { envMod: 1 });
      engine.noteOn(1, 36, false, false);
      render(engine, 0.4); // the filter envelope has closed
      engine.noteOn(2, 36, false, legato);
      return brightness(render(engine, 0.03));
    };
    expect(after(false)).toBeGreaterThan(after(true) * 1.5);
  });

  it('parameter jumps are smoothed: no click when every knob jumps at once', () => {
    const engine = bass({ cutoff: 0.1, drive: 0 });
    engine.noteOn(1, 36, false, false);
    render(engine, 0.1);
    const before = render(engine, 0.002);
    engine.setParams(bassParamsFromScene(bassScene({ cutoff: 1, drive: 1, wave: 'square', sub: true })));
    const after = render(engine, 0.004);
    expect(Math.abs(after[0]! - before[before.length - 1]!)).toBeLessThan(0.05);
  });
});

describe('SYNTH voice', () => {
  it('plays up to four notes at once and steals the oldest for a fifth', () => {
    const engine = synth({ preset: 'pad', attack: 0 });
    for (let id = 1; id <= SYNTH_VOICES; id++) engine.noteOn(id, 60 + id, false, false);
    render(engine, 0.05);
    expect(engine.activeVoices).toBe(4);
    engine.noteOn(5, 72, false, false);
    render(engine, 0.05);
    expect(engine.activeVoices).toBe(4);
    // Note 1 was stolen: its note-off does nothing; note 2's releases one voice.
    engine.noteOff(1);
    engine.noteOff(2);
    render(engine, 3);
    expect(engine.activeVoices).toBe(3);
  });

  it('a chord is louder than a single note but stays bounded with four voices at full settings', () => {
    const single = synth({ preset: 'pad' });
    single.noteOn(1, 60, false, false);
    const chord = synth({ preset: 'pad' });
    [60, 64, 67].forEach((midi, i) => chord.noteOn(i + 1, midi, false, false));
    expect(rms(render(chord, 0.5))).toBeGreaterThan(rms(render(single, 0.5)));

    const loud = synth({ preset: 'stab', cutoff: 1, resonance: 1, wave: 1, detune: 1 });
    [48, 55, 60, 67].forEach((midi, i) => loud.noteOn(i + 1, midi, true, false));
    const out = render(loud, 0.5);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(peak(out)).toBeLessThan(1);
  });

  it('two detuned oscillators: DETUNE changes the sound (the pair beats)', () => {
    const play = (detune: number) => {
      // The engine's own detune (the knob plus PAD's shift would never be exactly 0).
      const engine = synth({ preset: 'pad', attack: 0 }, { detune });
      engine.noteOn(1, 60, false, false);
      render(engine, 0.3);
      return render(engine, 0.5);
    };
    const still = play(0);
    const wide = play(1);
    // Envelope of 10 ms windows: a detuned pair swells and fades; a single pitch stays flat.
    const wobble = (x: Float32Array) => {
      const windows = Array.from({ length: 50 }, (_, w) => rms(x.subarray(w * 480, (w + 1) * 480)));
      return Math.max(...windows) - Math.min(...windows);
    };
    expect(wobble(wide)).toBeGreaterThan(wobble(still) * 2);
  });

  it('ATAQUE and RELEASE are adjustable', () => {
    const rise = (attack: number) => {
      const engine = synth({ preset: 'pad', attack });
      engine.noteOn(1, 60, false, false);
      return rms(render(engine, 0.05));
    };
    expect(rise(0)).toBeGreaterThan(rise(0.8) * 3);

    const tail = (release: number) => {
      const engine = synth({ preset: 'pad', release, attack: 0 });
      engine.noteOn(1, 60, false, false);
      render(engine, 0.3);
      engine.noteOff(1);
      render(engine, 0.15);
      return rms(render(engine, 0.05));
    };
    expect(tail(0.9)).toBeGreaterThan(tail(0) * 3);
  });

  it('is brighter and more open than the bass at their default settings', () => {
    const b = bass();
    b.noteOn(1, 48, false, false);
    const s = synth();
    s.noteOn(1, 48, false, false);
    expect(brightness(render(s, 0.1))).toBeGreaterThan(brightness(render(b, 0.1)));
  });

  it('each preset sounds different; PLUCK dies away, PAD sustains, GLASS sits an octave up', () => {
    const level = (preset: (typeof SYNTH_PRESETS)[number]) => {
      const engine = synth({ preset, attack: 0 });
      engine.noteOn(1, 60, false, false);
      render(engine, 1);
      return rms(render(engine, 0.1));
    };
    expect(level('pad')).toBeGreaterThan(level('pluck') * 5);
    const glass = synth({ preset: 'glass' });
    glass.noteOn(1, 60, false, false);
    render(glass, 0.01);
    expect(glass.frequency).toBeCloseTo(midiToHz(72), 3);
    const sounds = SYNTH_PRESETS.map((preset) => {
      const engine = synth({ preset });
      engine.noteOn(1, 60, false, false);
      return rms(render(engine, 0.4)).toFixed(4);
    });
    expect(new Set(sounds).size).toBe(SYNTH_PRESETS.length);
  });

  it('PLUCK and STAB are clearly different: PLUCK sweeps and dies away, STAB holds open and bright', () => {
    // A held chord, as the sequencer plays a one-bar note.
    const play = (preset: 'pluck' | 'stab') => {
      const engine = synth({ preset });
      [60, 64, 67].forEach((midi, i) => engine.noteOn(i + 1, midi, false, false));
      render(engine, 0.05); // past the onset
      const start = render(engine, 0.03); // 50–80 ms
      render(engine, 0.22);
      const held = render(engine, 0.05); // 300–350 ms, the gate still open
      return { start, held };
    };
    const pluck = play('pluck');
    const stab = play('stab');
    // PLUCK decays while held (to under half in a quarter second); STAB keeps its level.
    expect(rms(pluck.held)).toBeLessThan(rms(pluck.start) * 0.5);
    expect(rms(stab.held)).toBeGreaterThan(rms(stab.start) * 0.6);
    // PLUCK's filter closes while the note is held; STAB's stays open.
    const pluckKeeps = brightness(pluck.held) / brightness(pluck.start);
    const stabKeeps = brightness(stab.held) / brightness(stab.start);
    expect(pluckKeeps).toBeLessThan(0.7);
    expect(stabKeeps).toBeGreaterThan(pluckKeeps + 0.15);
    // And they are built differently: STAB is hollower, wider and driven.
    const p = synthParamsFromScene(synthScene({ preset: 'pluck' }));
    const s = synthParamsFromScene(synthScene({ preset: 'stab' }));
    expect(s.wave - p.wave).toBeGreaterThan(0.5);
    expect(s.detune - p.detune).toBeGreaterThan(0.5);
    expect(s.drive - p.drive).toBeGreaterThanOrEqual(0.5);
    expect(s.sustain - p.sustain).toBeGreaterThan(0.5);
  });

  it('allOff releases every voice', () => {
    const engine = synth({ preset: 'pad', release: 0 });
    [60, 64, 67].forEach((midi, i) => engine.noteOn(i + 1, midi, false, false));
    render(engine, 0.1);
    engine.allOff();
    render(engine, 0.5);
    expect(engine.activeVoices).toBe(0);
  });
});
