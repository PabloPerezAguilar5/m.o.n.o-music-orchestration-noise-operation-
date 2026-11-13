import type { AudioScene } from '../../core/audio-scene';
import type { NodeId } from '../../core/nodes';
import type { ScaleId } from '../../core/scales';
import type { VoiceEvent } from '../../core/voice-events';
import type { EngineParams } from './engine';
import { VoiceModule } from './voice-module';
import type { VoiceInstrument } from './voice-messages';

/** What every voice instrument's part of the scene has. */
export interface TrackScene {
  readonly generation: number;
  readonly root: number;
  readonly scale: ScaleId;
}

/** How one instrument (BASS, SYNTH) plugs into a VoiceTrack. */
export interface TrackSpec<S extends TrackScene> {
  readonly id: NodeId;
  readonly instrument: VoiceInstrument;
  /** Level of the module into its cable. */
  readonly level: number;
  part(scene: AudioScene): S;
  params(part: S): EngineParams;
  /** Voice events for one step of the part that is playing. */
  events(part: S, step: number, time: number, duration: number): VoiceEvent[];
  /** Forgets sequencer state (held notes) after a flush. */
  reset(): void;
}

/**
 * One instrument on the shared voice engine, as the backend runs it: its module in the
 * graph, the part of the scene it is playing, and what waits for the next bar.
 *
 * Applies at once: knobs and keys (parameters), hand edits of the pattern. Waits for the
 * bar: a regenerated pattern (and with it a new mode), tonic and scale.
 */
export class VoiceTrack<S extends TrackScene> {
  module: VoiceModule | null = null;
  private playing: S | null = null;

  constructor(private readonly spec: TrackSpec<S>) {}

  get id(): NodeId {
    return this.spec.id;
  }

  /** A new scene: continuous changes now. */
  update(scene: AudioScene): void {
    const part = this.spec.part(scene);
    this.module?.setParams(this.spec.params(part));
    const playing = this.playing;
    if (!playing) {
      this.playing = part;
    } else if (part.generation === playing.generation) {
      // Hand edits and settings sound from the next step; the key keeps waiting for the bar.
      this.playing = { ...part, root: playing.root, scale: playing.scale };
    }
  }

  /** Whether the scene has a pattern or key change that waits for the next bar. */
  pending(scene: AudioScene): boolean {
    const part = this.spec.part(scene);
    const playing = this.playing;
    return !!playing && (part.generation !== playing.generation || part.root !== playing.root || part.scale !== playing.scale);
  }

  /** At the bar: the scene's pattern and key take over. */
  commit(scene: AudioScene): void {
    this.playing = this.spec.part(scene);
  }

  /** Creates the module (the caller adds it to the graph). */
  create(context: BaseAudioContext, scene: AudioScene): VoiceModule {
    const module = new VoiceModule(context, this.spec.instrument, this.spec.level);
    module.setParams(this.spec.params(this.spec.part(scene)));
    this.module = module;
    return module;
  }

  /** Silences from `time`: drops scheduled notes and releases the sounding ones. */
  flush(time: number): void {
    this.module?.flush(time);
    this.spec.reset();
  }

  /** The module is leaving the graph. */
  drop(time: number): void {
    this.flush(time);
    this.module = null;
  }

  /** Schedules one step. Returns whether a note started on it (the node lights up). */
  play(step: number, time: number, duration: number): boolean {
    const module = this.module;
    const part = this.playing;
    if (!module || !part) return false;
    const events = this.spec.events(part, step, time, duration);
    module.schedule(events);
    return events.some((event) => event.type === 'on');
  }
}
