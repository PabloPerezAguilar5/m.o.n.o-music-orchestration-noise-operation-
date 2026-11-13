import { describe, expect, it } from 'vitest';
import { createBassEngine } from '../../src/audio/bass/bass-voice';
import { DIST_LATENCY, DistDsp } from '../../src/audio/distortion/dist-dsp';
import { LFO_SLEW, LfoDsp, type LfoSettings } from '../../src/audio/lfo/lfo-dsp';
import { DEFAULT_ENGINE_PARAMS } from '../../src/audio/voice/engine';
import type { DistSettings } from '../../src/core/dist';
import {
  LFO_DIVISION_LABELS,
  lfoDivisionIndex,
  lfoFreeRate,
  lfoRate,
  lfoRateLabel,
  lfoWave,
} from '../../src/core/lfo';
import { LfoMonitor } from '../../src/state/lfo-monitor';

const RATE = 48_000;
const BLOCK = 128;

const settings = (patch: Partial<DistSettings> = {}): DistSettings => ({
  type: 'soft',
  drive: 0.5,
  tone: 1,
  mix: 1,
  output: 0.5,
  chaos: 0,
  ...patch,
});

/** Runs a whole signal through the DSP in render blocks. `before` runs ahead of each block. */
function distort(dsp: DistDsp, input: Float32Array, before?: (start: number) => void): Float32Array {
  const output = new Float32Array(input.length);
  for (let start = 0; start < input.length; start += BLOCK) {
    before?.(start);
    const end = Math.min(input.length, start + BLOCK);
    const out = output.subarray(start, end);
    dsp.process([input.subarray(start, end)], [out]);
  }
  return output;
}

const sine = (hz: number, seconds: number, amplitude = 0.8): Float32Array =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE));

/** Amplitude of one frequency in a signal (Goertzel). */
function amplitudeAt(signal: Float32Array, hz: number): number {
  const w = (2 * Math.PI * hz) / RATE;
  let re = 0;
  let im = 0;
  for (let i = 0; i < signal.length; i++) {
    re += signal[i]! * Math.cos(w * i);
    im -= signal[i]! * Math.sin(w * i);
  }
  return (2 * Math.hypot(re, im)) / signal.length;
}

const maxStep = (signal: Float32Array, from = 1): number => {
  let max = 0;
  for (let i = Math.max(1, from); i < signal.length; i++) max = Math.max(max, Math.abs(signal[i]! - signal[i - 1]!));
  return max;
};

describe('DISTORSIÓN (DSP)', () => {
  it('el sobremuestreo evita el aliasing: casi nada cae en frecuencias que no son armónicas', () => {
    // A 9 kHz sine driven almost square: its 5th harmonic (45 kHz) would fold to 3 kHz at
    // 48 kHz, about -17 dB from the fundamental without oversampling.
    for (const type of ['hard', 'soft'] as const) {
      const dsp = new DistDsp(RATE);
      dsp.setParams(settings({ type, drive: 1 }));
      const out = distort(dsp, sine(9_000, 0.5)).subarray(RATE * 0.1);
      const fundamental = amplitudeAt(out, 9_000);
      const alias = amplitudeAt(out, 3_000);
      expect(fundamental).toBeGreaterThan(0.1);
      expect(20 * Math.log10(alias / fundamental)).toBeLessThan(-45);
    }
  });

  it('bloquea la continua que deja la saturación asimétrica', () => {
    const dsp = new DistDsp(RATE);
    dsp.setParams(settings({ type: 'soft', drive: 1 }));
    const out = distort(dsp, sine(220, 2)).subarray(RATE);
    const mean = out.reduce((sum, x) => sum + x, 0) / out.length;
    expect(Math.abs(mean)).toBeLessThan(0.002);
  });

  it('el limitador final nunca deja pasar de 0 dBFS, ni con todo al máximo', () => {
    for (const type of ['soft', 'hard', 'crush'] as const) {
      const dsp = new DistDsp(RATE);
      dsp.setParams(settings({ type, drive: 1, output: 1, chaos: 1 }));
      const out = distort(dsp, sine(110, 0.5, 4));
      expect(Math.max(...out.map(Math.abs))).toBeLessThan(1);
    }
  });

  it('el seco y el húmedo salen alineados (sin peine al mezclar)', () => {
    const impulse = new Float32Array(512);
    impulse[10] = 0.1;
    const peakAt = (signal: Float32Array): number =>
      signal.reduce((best, x, i) => (Math.abs(x) > Math.abs(signal[best]!) ? i : best), 0);
    // Knobs glide in: a moment of silence first, so MEZCLA has got where it is going.
    const settled = (patch: Partial<DistSettings>): DistDsp => {
      const dsp = new DistDsp(RATE);
      dsp.setParams(settings(patch));
      distort(dsp, new Float32Array(RATE / 5));
      return dsp;
    };
    const dry = settled({ mix: 0 });
    expect(peakAt(distort(dry, impulse))).toBe(10 + DIST_LATENCY);
    // The wet path has the same latency; TONO (a low-pass) adds its own small lag.
    const wet = settled({ mix: 1, drive: 0 });
    expect(Math.abs(peakAt(distort(wet, impulse)) - (10 + DIST_LATENCY))).toBeLessThanOrEqual(2);
  });

  it('CRUSH reduce bits y frecuencia de muestreo: la señal queda en escalones', () => {
    const dsp = new DistDsp(RATE);
    dsp.setParams(settings({ type: 'crush', drive: 1, tone: 1 }));
    const out = distort(dsp, sine(100, 0.3)).subarray(RATE * 0.1);
    // Few distinct levels compared with a smooth sine.
    const levels = new Set(Array.from(out, (x) => Math.round(x * 1000)));
    expect(levels.size).toBeLessThan(out.length / 4);
  });

  it('mover perillas y cambiar de tipo no hace chasquidos', () => {
    const steady = new DistDsp(RATE);
    steady.setParams(settings({ drive: 0.2 }));
    const input = sine(80, 1, 0.5);
    const reference = maxStep(distort(steady, input));

    const moved = new DistDsp(RATE);
    moved.setParams(settings({ drive: 0.2 }));
    const out = distort(moved, input, (start) => {
      // Jumps mid-stream: every knob, then the type twice.
      if (start === RATE * 0.25 - ((RATE * 0.25) % BLOCK)) moved.setParams(settings({ drive: 0.9, mix: 0.3, output: 0.9, tone: 0.2 }));
      if (start === RATE * 0.5 - ((RATE * 0.5) % BLOCK)) moved.setParams(settings({ type: 'hard', drive: 0.9, mix: 0.3, output: 0.9, tone: 0.2 }));
      if (start === RATE * 0.75 - ((RATE * 0.75) % BLOCK)) moved.setParams(settings({ type: 'crush', drive: 0.3, mix: 0.3, output: 0.9, tone: 0.2 }));
    });
    // The 80 Hz sine moves at most ~0.005 a sample; steps stay in that league.
    expect(maxStep(out)).toBeLessThan(Math.max(0.05, reference * 4));
  });

  it('el LFO sobre DRIVE (en unidades de perilla) cambia el color, muestra a muestra', () => {
    const plain = new DistDsp(RATE);
    plain.setParams(settings({ drive: 0 }));
    const moved = new DistDsp(RATE);
    moved.setParams(settings({ drive: 0 }));
    const input = sine(200, 0.2, 0.5);
    const a = new Float32Array(input.length);
    const b = new Float32Array(input.length);
    for (let start = 0; start < input.length; start += BLOCK) {
      const end = Math.min(input.length, start + BLOCK);
      plain.process([input.subarray(start, end)], [a.subarray(start, end)]);
      moved.process([input.subarray(start, end)], [b.subarray(start, end)], Float32Array.of(0.8));
    }
    // Harmonics relative to the fundamental: more drive, more of them (the level is made up).
    const third = (signal: Float32Array): number => {
      const settled = signal.subarray(RATE * 0.1);
      return amplitudeAt(settled, 600) / amplitudeAt(settled, 200);
    };
    expect(third(b)).toBeGreaterThan(third(a) * 4);
  });
});

describe('LFO', () => {
  const run = (dsp: LfoDsp, seconds: number): Float32Array => {
    const out = new Float32Array(Math.round(seconds * RATE));
    for (let start = 0; start < out.length; start += BLOCK) dsp.render(out, start, Math.min(out.length, start + BLOCK));
    return out;
  };
  const lfo = (patch: Partial<LfoSettings> = {}): LfoDsp => {
    const dsp = new LfoDsp(RATE);
    dsp.setParams({ shape: 'sine', rate: 2, sync: false, chaos: 0, ...patch });
    return dsp;
  };

  it('VELOCIDAD: 0.05 a 20 Hz libre; con SYNC, divisiones del tempo', () => {
    expect(lfoFreeRate(0)).toBeCloseTo(0.05);
    expect(lfoFreeRate(1)).toBeCloseTo(20);
    expect(LFO_DIVISION_LABELS).toEqual(['1/1', '1/2', '1/4', '1/8', '1/16']);
    expect(lfoDivisionIndex(0)).toBe(0);
    expect(lfoDivisionIndex(1)).toBe(4);
    // At 120 bpm: a whole note lasts 2 s, a quarter 0.5 s, a sixteenth 0.125 s.
    expect(lfoRate(0, true, 120)).toBeCloseTo(0.5);
    expect(lfoRate(0.5, true, 120)).toBeCloseTo(2);
    expect(lfoRate(1, true, 120)).toBeCloseTo(8);
    expect(lfoRateLabel(0.5, true)).toBe('1/4');
    expect(lfoRateLabel(1, false)).toBe('20 Hz');
  });

  it('las formas van de -1 a 1', () => {
    expect(lfoWave('sine', 0.25)).toBeCloseTo(1);
    expect(lfoWave('triangle', 0.25)).toBeCloseTo(1);
    expect(lfoWave('triangle', 0.75)).toBeCloseTo(-1);
    expect(lfoWave('square', 0.1)).toBe(1);
    expect(lfoWave('square', 0.6)).toBe(-1);
    expect(lfoWave('random', 0.3, 0.42)).toBe(0.42);
  });

  it('un seno de 2 Hz da dos ciclos por segundo y llega a ±1', () => {
    const out = run(lfo(), 1.05);
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1]! < 0 && out[i]! >= 0) crossings++;
    expect(crossings).toBe(2);
    expect(Math.max(...out)).toBeGreaterThan(0.98);
    expect(Math.min(...out)).toBeLessThan(-0.98);
  });

  it('CUADRADA y RANDOM no saltan: cada borde se suaviza', () => {
    const limit = 2 * (1 - Math.exp(-1 / (LFO_SLEW * RATE))) + 1e-6;
    for (const shape of ['square', 'random'] as const) {
      const out = run(lfo({ shape, rate: 8 }), 1);
      expect(maxStep(out)).toBeLessThanOrEqual(limit);
      // And it does move: the full swing is reached.
      expect(Math.max(...out) - Math.min(...out)).toBeGreaterThan(0.5);
    }
  });

  it('con SYNC empieza el ciclo en cada compás', () => {
    const dsp = lfo({ sync: true, rate: 0.3 });
    run(dsp, 0.7);
    expect(dsp.currentPhase).toBeGreaterThan(0.15);
    dsp.bar(10);
    const out = new Float32Array(BLOCK);
    dsp.render(out, 0, BLOCK);
    expect(dsp.currentPhase).toBeCloseTo((0.3 * (BLOCK - 10)) / RATE, 5);
  });

  it('CAOS en 0 es exacto; arriba, cada ciclo varía de alto', () => {
    const calm = run(lfo({ rate: 10 }), 1).subarray(RATE * 0.2);
    const peaksOf = (signal: Float32Array): number[] => {
      const peaks: number[] = [];
      for (let i = 1; i < signal.length - 1; i++) {
        if (signal[i]! > signal[i - 1]! && signal[i]! >= signal[i + 1]! && signal[i]! > 0) peaks.push(signal[i]!);
      }
      return peaks;
    };
    const calmPeaks = peaksOf(calm);
    expect(Math.max(...calmPeaks) - Math.min(...calmPeaks)).toBeLessThan(0.01);
    const wild = peaksOf(run(lfo({ rate: 10, chaos: 1 }), 1).subarray(RATE * 0.2));
    expect(Math.max(...wild) - Math.min(...wild)).toBeGreaterThan(0.2);
  });

  it('el LFO llega al CUTOFF del motor de voz: el filtro se abre y se cierra con la onda', () => {
    const brightness = (mod?: Float32Array): number => {
      const engine = createBassEngine(RATE);
      engine.setParams({ ...DEFAULT_ENGINE_PARAMS, cutoff: 0.3, resonance: 0, envMod: 0, drive: 0 });
      engine.noteOn(1, 33, false, false);
      const out = new Float32Array(RATE / 4);
      for (let start = 0; start < out.length; start += BLOCK) engine.render(out, start, start + BLOCK, mod);
      // Energy of the sample-to-sample difference: more highs, more of it.
      let sum = 0;
      for (let i = RATE / 8; i < out.length; i++) sum += (out[i]! - out[i - 1]!) ** 2;
      return sum;
    };
    const closed = brightness(Float32Array.of(-0.3));
    const still = brightness();
    const open = brightness(Float32Array.of(0.3));
    expect(open).toBeGreaterThan(still * 2);
    expect(still).toBeGreaterThan(closed * 2);
  });
});

describe('LfoMonitor (lo que dibuja la interfaz)', () => {
  it('guarda la onda reciente y avisa cuando deja de llegar', () => {
    let now = 0;
    const monitor = new LfoMonitor(500, () => now);
    expect(monitor.running).toBe(false);
    expect(monitor.latest()).toBe(0);
    monitor.push(Float32Array.of(0.1, 0.2, 0.3));
    expect(monitor.running).toBe(true);
    expect(monitor.latest()).toBeCloseTo(0.3);
    const out = new Float32Array(5);
    monitor.recent(5, out);
    expect(Array.from(out).map((x) => Math.round(x * 10) / 10)).toEqual([0, 0, 0.1, 0.2, 0.3]);
    now = 1000;
    expect(monitor.running).toBe(false);
    expect(monitor.latest()).toBe(0);
  });
});
