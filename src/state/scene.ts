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
  const bassKnobs = state.params.bass;
  const { bass } = state;
  return {
    bpm: state.transport.bpm,
    nodes: state.added,
    cables: state.added.filter((id) => id !== 'master' && !state.unplugged.includes(id)),
    master: {
      volume: master.volume ?? 0,
      drumLevel: master.drumLevel ?? 0,
      bassLevel: master.bassLevel ?? 0,
    },
    bass: {
      generation: bass.generation,
      pattern: bass.pattern,
      mode: bass.mode,
      root: bass.root,
      scale: bass.scale,
      cutoff: bassKnobs.cutoff ?? 0,
      resonance: bassKnobs.resonance ?? 0,
      decay: bassKnobs.decay ?? 0,
      drive: bassKnobs.drive ?? 0,
      wave: bass.wave,
      sub: bass.sub,
    },
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
