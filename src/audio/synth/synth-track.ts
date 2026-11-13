import type { SynthScene } from '../../core/audio-scene';
import { synthMidi } from '../../core/scales';
import { SynthSequencer } from '../../core/synth-patterns';
import type { TrackSpec } from '../voice/voice-track';
import { synthParamsFromScene } from './synth-voice';

/**
 * Level of the SYNTH module into its cable. Above 1 on purpose: the MASTER's SYNTH knob
 * starts lower than BASS (the prototype's knob positions), and this evens them out.
 */
export const SYNTH_LEVEL = 1.5;

/** SYNTH on a VoiceTrack: four voices, chords of up to three notes, a length per step. */
export function synthTrackSpec(): TrackSpec<SynthScene> {
  const sequencer = new SynthSequencer();
  return {
    id: 'synth',
    instrument: 'synth',
    level: SYNTH_LEVEL,
    part: (scene) => scene.synth,
    params: synthParamsFromScene,
    events: (part, step, time, duration) =>
      sequencer.step(part.pattern, step, time, duration, (note) => synthMidi(part.root, part.scale, note)),
    reset: () => sequencer.reset(),
  };
}
