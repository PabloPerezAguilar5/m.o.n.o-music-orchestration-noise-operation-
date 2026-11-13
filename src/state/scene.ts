import type { AudioScene } from '../core/audio-scene';
import { DRUM_ROWS, drumToneParam, drumVolumeParam, type DrumRow } from '../core/nodes';
import type { AppState } from './types';

/** What should sound for a given app state. */
export function sceneFromState(state: AppState): AudioScene {
  const master = state.params.master;
  const drum = state.params.drum;
  const rows = Object.fromEntries(
    DRUM_ROWS.map((row) => [
      row,
      { volume: drum[drumVolumeParam(row)] ?? 0, tone: drum[drumToneParam(row)] ?? 0.5 },
    ]),
  ) as Record<DrumRow, { volume: number; tone: number }>;
  return {
    bpm: state.transport.bpm,
    nodes: state.added,
    master: { volume: master.volume ?? 0, drumLevel: master.drumLevel ?? 0 },
    drum: {
      kit: state.drum.kit,
      seed: state.drum.seed,
      generation: state.drum.generation,
      pattern: state.drum.pattern,
      rows,
    },
    metronome: state.metronome,
  };
}
