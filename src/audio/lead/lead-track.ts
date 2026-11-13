import type { AudioScene } from '../../core/audio-scene';
import type { LiveEvent } from '../../core/live-events';
import type { VoiceEvent } from '../../core/voice-events';
import { VoiceModule } from '../voice/voice-module';
import { leadParamsFromScene } from './lead-voice';

/** Level of the LEAD module into its cable: a held note sits about as loud as a BASS line. */
export const LEAD_LEVEL = 2;

/**
 * LEAD as the backend runs it: its module on the shared voice engine and the live notes,
 * played the moment they arrive. Knobs apply at once; there is nothing to wait for.
 */
export class LeadTrack {
  readonly id = 'lead' as const;
  module: VoiceModule | null = null;

  update(scene: AudioScene): void {
    this.module?.setParams(leadParamsFromScene(scene.lead));
  }

  /** Creates the module (the caller adds it to the graph). */
  create(context: BaseAudioContext, scene: AudioScene): VoiceModule {
    const module = new VoiceModule(context, 'lead', LEAD_LEVEL);
    module.setParams(leadParamsFromScene(scene.lead));
    this.module = module;
    return module;
  }

  /** Plays a LEAD event at `time` (now, for a key just touched). */
  play(event: LiveEvent, time: number): void {
    const module = this.module;
    if (!module || event.node !== 'lead') return;
    if (event.type === 'panic') {
      module.flush(time);
      return;
    }
    const voice: VoiceEvent =
      event.type === 'on'
        ? { type: 'on', time, id: event.id, midi: event.midi, accent: event.accent, legato: event.legato }
        : { type: 'off', time, id: event.id };
    module.schedule([voice]);
  }

  /** Releases every note from `time`: with its release (stop) or `hard`, at once (cable cut). */
  flush(time: number, hard = false): void {
    this.module?.flush(time, hard);
  }

  /** The module is leaving the graph. */
  drop(time: number): void {
    this.flush(time);
    this.module = null;
  }
}
