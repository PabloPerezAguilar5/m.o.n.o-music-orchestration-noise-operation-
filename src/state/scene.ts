import type { AudioScene } from '../core/audio-scene';
import { DRUM_ROWS, drumToneParam, drumVolumeParam, MACRO_PARAM, type DrumRow } from '../core/nodes';
import { liveCables } from '../core/routing';
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
  const synthKnobs = state.params.synth;
  const leadKnobs = state.params.lead;
  const droneKnobs = state.params.drone;
  const { bass, synth, key } = state;
  return {
    bpm: state.transport.bpm,
    nodes: state.added,
    cables: liveCables(state.cables, state.added).map(({ from, to }) => ({ from, to })),
    master: {
      volume: master.volume ?? 0,
      drumLevel: master.drumLevel ?? 0,
      bassLevel: master.bassLevel ?? 0,
      synthLevel: master.synthLevel ?? 0,
      leadLevel: master.leadLevel ?? 0,
      droneLevel: master.droneLevel ?? 0,
    },
    bass: {
      generation: bass.generation,
      pattern: bass.pattern,
      mode: bass.mode,
      root: key.root,
      scale: key.scale,
      cutoff: bassKnobs.cutoff ?? 0,
      resonance: bassKnobs.resonance ?? 0,
      decay: bassKnobs.decay ?? 0,
      drive: bassKnobs.drive ?? 0,
      wave: bass.wave,
      sub: bass.sub,
      slides: bass.slides,
    },
    synth: {
      generation: synth.generation,
      pattern: synth.pattern,
      preset: synth.preset,
      root: key.root,
      scale: key.scale,
      wave: synthKnobs.wave ?? 0,
      cutoff: synthKnobs.cutoff ?? 0,
      resonance: synthKnobs.resonance ?? 0,
      attack: synthKnobs.attack ?? 0,
      release: synthKnobs.release ?? 0,
      detune: synthKnobs.detune ?? 0,
    },
    lead: {
      wave: leadKnobs.wave ?? 0,
      cutoff: leadKnobs.cutoff ?? 0,
      resonance: leadKnobs.resonance ?? 0,
      attack: leadKnobs.attack ?? 0,
      release: leadKnobs.release ?? 0,
      glide: leadKnobs.glide ?? 0,
    },
    drone: {
      preset: state.drone.preset,
      root: key.root,
      scale: key.scale,
      filter: droneKnobs.filter ?? 0,
      attack: droneKnobs.attack ?? 0,
      release: droneKnobs.release ?? 0,
      detune: droneKnobs.detune ?? 0,
      volume: droneKnobs.volume ?? 0,
      chaos: droneKnobs[MACRO_PARAM] ?? 0,
    },
    dist: {
      type: state.distType,
      drive: state.params.dist.drive ?? 0,
      tone: state.params.dist.tone ?? 0,
      mix: state.params.dist.mix ?? 0,
      output: state.params.dist.output ?? 0,
      chaos: state.params.dist[MACRO_PARAM] ?? 0,
    },
    lfo: {
      shape: state.lfo.shape,
      sync: state.lfo.sync,
      rate: state.params.lfo.rate ?? 0,
      depth: state.params.lfo.depth ?? 0,
      chaos: state.params.lfo[MACRO_PARAM] ?? 0,
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
