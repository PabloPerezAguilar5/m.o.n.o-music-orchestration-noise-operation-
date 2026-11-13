import type { BassScene } from '../../core/audio-scene';
import { BassSequencer } from '../../core/bass-patterns';
import { BASS_VOICES } from '../../core/bass-voices';
import { bassMidi } from '../../core/scales';
import type { TrackSpec } from '../voice/voice-track';
import { bassParamsFromScene } from './bass-voice';

/** Level of the BASS module into its cable. */
export const BASS_LEVEL = 0.9;

/** BASS on a VoiceTrack: one mono voice, notes with slide and accent, the mode's gate. */
export function bassTrackSpec(): TrackSpec<BassScene> {
  const sequencer = new BassSequencer();
  return {
    id: 'bass',
    instrument: 'bass',
    level: BASS_LEVEL,
    part: (scene) => scene.bass,
    params: bassParamsFromScene,
    events: (part, step, time, duration) =>
      sequencer.step(
        part.pattern,
        step,
        time,
        duration,
        (degree) => bassMidi(part.root, part.scale, degree),
        BASS_VOICES[part.mode].gate,
      ),
    reset: () => sequencer.reset(),
  };
}
