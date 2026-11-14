import type { AudioModule } from '../graph';
import { MOD_SOURCE } from '../modulation';
import type { VoiceModule } from '../voice/voice-module';
import type { SliceModule } from './slice-module';

/**
 * BASS in the audio graph: both voices, the 303 (shared voice engine, null where the
 * worklet could not load) and SLICE, summed into one `output`, so the node's cables,
 * its level on MASTER and its routing to the DISTORSIÓN are the same whichever voice
 * plays. The LFO's cable lands on both filters: the one playing is the one heard.
 */
export class BassModule implements AudioModule {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly mod: GainNode;

  constructor(
    context: BaseAudioContext,
    readonly voice: VoiceModule | null,
    readonly slicer: SliceModule,
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.mod = context.createGain();
    voice?.output.connect(this.output);
    slicer.output.connect(this.output);
    if (voice) this.mod.connect(voice.inputFor(MOD_SOURCE));
    this.mod.connect(slicer.inputFor(MOD_SOURCE));
  }

  inputFor(source: string): AudioNode {
    return source === MOD_SOURCE ? this.mod : this.input;
  }

  dispose(): void {
    this.voice?.dispose();
    this.slicer.dispose();
    this.mod.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }
}
