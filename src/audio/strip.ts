import type { AudioModule } from './graph';

/** Level changes glide (time constant), seconds. */
const LEVEL_SMOOTHING = 0.015;

/**
 * An instrument's level, at its output: the module, then a gain, then its cables. The
 * level knob on MASTER sets it, so it applies to every cable the instrument sends
 * (straight to MASTER or into an effect) alike.
 */
export class Strip implements AudioModule {
  readonly output: GainNode;

  constructor(
    context: BaseAudioContext,
    private readonly inner: AudioModule,
    level: number,
  ) {
    this.output = context.createGain();
    this.output.gain.value = level;
    inner.output.connect(this.output);
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

  dispose(): void {
    this.inner.dispose();
    this.output.disconnect();
  }
}
