import type { AudioModule } from './graph';

/** Level changes glide (time constant), seconds. */
const LEVEL_SMOOTHING = 0.015;
/**
 * ON/OFF fades with this time constant: 95 % of the way in 15 ms, 99 % in 25 ms, short
 * enough to feel immediate and long enough not to click. Then it settles exactly.
 */
const MUTE_FADE = 0.005;
const MUTE_SETTLE = 0.04;

/**
 * An instrument's level, at its output: the module, then the ON/OFF gate, then the level,
 * then its cables. The level knob on MASTER sets the level and the ON/OFF key closes the
 * gate, so both apply to every cable the instrument sends (straight to MASTER or into an
 * effect) alike. The module itself keeps running when the gate is closed.
 */
export class Strip implements AudioModule {
  readonly output: GainNode;
  /** 1 while ON, 0 while OFF. */
  private readonly gate: GainNode;

  constructor(
    context: BaseAudioContext,
    private readonly inner: AudioModule,
    level: number,
    muted = false,
  ) {
    this.gate = context.createGain();
    this.gate.gain.value = muted ? 0 : 1;
    this.output = context.createGain();
    this.output.gain.value = level;
    inner.output.connect(this.gate);
    this.gate.connect(this.output);
  }

  get input(): AudioNode {
    return this.inner.input;
  }

  inputFor(source: string): AudioNode {
    return this.inner.inputFor?.(source) ?? this.inner.input;
  }

  setLevel(gain: number, time: number): void {
    this.output.gain.setTargetAtTime(gain, time, LEVEL_SMOOTHING);
  }

  /** OFF (`muted`) or ON, with a short fade; it applies from `time`, not at the next bar. */
  setMuted(muted: boolean, time: number): void {
    const target = muted ? 0 : 1;
    const gain = this.gate.gain;
    gain.cancelScheduledValues(time);
    gain.setTargetAtTime(target, time, MUTE_FADE);
    // The exponential only gets close; settle on the exact value once it has.
    gain.setValueAtTime(target, time + MUTE_SETTLE);
  }

  dispose(): void {
    this.inner.dispose();
    this.gate.disconnect();
    this.output.disconnect();
  }
}
