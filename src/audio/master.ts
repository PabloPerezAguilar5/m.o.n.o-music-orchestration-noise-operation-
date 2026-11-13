import type { AudioModule } from './graph';

/** Smoothing of level changes (time constant), seconds. */
const LEVEL_SMOOTHING = 0.015;

/**
 * Transparent below 0.7, then bends smoothly towards 0.99. A last line of defence for
 * peaks the compressor's attack lets through (idea from fck-synth's tanh limiter,
 * without colouring normal levels).
 */
export function softClipCurve(size = 2049): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const knee = 0.7;
  const room = 0.99 - knee;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const y = magnitude <= knee ? magnitude : knee + room * Math.tanh((magnitude - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** Peaks of the mix (linear, 1 = 0 dBFS) and the limiter's gain reduction (dB, ≤ 0). */
export interface MixMeter {
  /** The sum of every channel after VOL, before the limiter. */
  readonly bus: number;
  /** What leaves the master. */
  readonly out: number;
  readonly reduction: number;
}

/**
 * MASTER: one input channel per source (its level knob), summed into
 * VOL → limiter → soft clip → analyser. `output` goes to the speakers.
 */
export class MasterBus implements AudioModule {
  readonly input: GainNode;
  readonly output: AnalyserNode;
  private readonly volume: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly clip: WaveShaperNode;
  private readonly channels = new Map<string, GainNode>();
  private readonly levels = new Map<string, number>();
  private readonly meter: Float32Array<ArrayBuffer>;
  /** A side tap on the bus before the limiter, for mix() only. */
  private readonly busTap: AnalyserNode;

  constructor(private readonly context: BaseAudioContext) {
    this.input = context.createGain();
    this.volume = context.createGain();

    // Brick-wall-ish limiter: fast attack, hard knee, high ratio, just below full scale.
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;

    this.clip = context.createWaveShaper();
    this.clip.curve = softClipCurve();
    this.clip.oversample = '4x';

    this.output = context.createAnalyser();
    this.output.fftSize = 2048;
    this.meter = new Float32Array(this.output.fftSize);

    this.input.connect(this.volume).connect(this.limiter).connect(this.clip).connect(this.output);
    this.busTap = context.createAnalyser();
    this.busTap.fftSize = this.output.fftSize;
    this.volume.connect(this.busTap);
  }

  /** Peaks before and after the limiter over the last ~40 ms, and the limiter's reduction. */
  mix(): MixMeter {
    const peak = (analyser: AnalyserNode): number => {
      analyser.getFloatTimeDomainData(this.meter);
      let max = 0;
      for (const sample of this.meter) max = Math.max(max, Math.abs(sample));
      return max;
    };
    return { bus: peak(this.busTap), out: peak(this.output), reduction: this.limiter.reduction };
  }

  /** The mixer channel for a source, created on first use. */
  inputFor(source: string): AudioNode {
    let channel = this.channels.get(source);
    if (!channel) {
      channel = this.context.createGain();
      channel.gain.value = this.levels.get(source) ?? 1;
      channel.connect(this.input);
      this.channels.set(source, channel);
    }
    return channel;
  }

  setVolume(gain: number, time: number): void {
    this.volume.gain.setTargetAtTime(gain, time, LEVEL_SMOOTHING);
  }

  /** Level of a source's channel; remembered for channels created later. */
  setChannelLevel(source: string, gain: number, time: number): void {
    this.levels.set(source, gain);
    this.channels.get(source)?.gain.setTargetAtTime(gain, time, LEVEL_SMOOTHING);
  }

  /** RMS of what is leaving the master right now (0 = silence). */
  level(): number {
    this.output.getFloatTimeDomainData(this.meter);
    let sum = 0;
    for (const sample of this.meter) sum += sample * sample;
    return Math.sqrt(sum / this.meter.length);
  }

  dispose(): void {
    for (const channel of this.channels.values()) channel.disconnect();
    this.input.disconnect();
    this.volume.disconnect();
    this.limiter.disconnect();
    this.clip.disconnect();
    this.output.disconnect();
    this.busTap.disconnect();
  }
}
