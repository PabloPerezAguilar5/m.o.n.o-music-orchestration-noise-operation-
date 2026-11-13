import { clickGain, type Click } from '../core/metronome';

/** Pitch and level of each click: beat 1 higher and louder. */
const VOICES: Readonly<Record<Click, { frequency: number; level: number }>> = {
  accent: { frequency: 1760, level: 0.5 },
  beat: { frequency: 1175, level: 0.25 },
};
const ATTACK = 0.001;
const DECAY = 0.045;
const LEVEL_SMOOTHING = 0.015;

/**
 * Metronome clicks, synthesized. Its output goes straight to the speakers: no master
 * VOL, limiter, effects or distortion, so it stays steady whatever the mix does.
 * Clicks are scheduled by the caller with the same clock and times as every step.
 */
export class MetronomeVoice {
  private readonly output: GainNode;
  private readonly meter: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;
  private readonly pending = new Set<{ readonly oscillator: OscillatorNode; readonly start: number }>();

  constructor(
    private readonly context: BaseAudioContext,
    destination: AudioNode,
  ) {
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.output.connect(destination);
    // A side tap for level(); it is not in the path to the speakers.
    this.meter = context.createAnalyser();
    this.meter.fftSize = 2048;
    this.samples = new Float32Array(this.meter.fftSize);
    this.output.connect(this.meter);
  }

  /** Peak of what the clicks are sending to the speakers right now (0 = silence). */
  level(): number {
    this.meter.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
    return peak;
  }

  /** VOL knob (0..1), smoothly from `time`. */
  setVolume(knob: number, time: number): void {
    this.output.gain.setTargetAtTime(clickGain(knob), time, LEVEL_SMOOTHING);
  }

  /** One click at `time`. */
  click(kind: Click, time: number): void {
    const { frequency, level } = VOICES[kind];
    const oscillator = this.context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + ATTACK);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + ATTACK + DECAY);
    oscillator.connect(envelope).connect(this.output);
    const entry = { oscillator, start: time };
    this.pending.add(entry);
    oscillator.addEventListener('ended', () => {
      envelope.disconnect();
      this.pending.delete(entry);
    });
    oscillator.start(time);
    oscillator.stop(time + ATTACK + DECAY + 0.01);
  }

  /** Cancels clicks scheduled ahead that have not started by `time` (on stop). */
  cancelAfter(time: number): void {
    for (const entry of this.pending) {
      if (entry.start <= time) continue;
      try {
        entry.oscillator.stop(0);
      } catch {
        // Older engines throw on a second stop(); there the click just plays out.
      }
      this.pending.delete(entry);
    }
  }

  dispose(): void {
    this.output.disconnect();
    this.meter.disconnect();
  }
}
