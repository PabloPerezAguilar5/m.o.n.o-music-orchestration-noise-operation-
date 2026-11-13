import { createBassEngine } from '../bass/bass-voice';
import { createLeadEngine } from '../lead/lead-voice';
import { createSynthEngine } from '../synth/synth-voice';
import type { VoiceDsp } from './engine';
import type { VoiceInstrument } from './voice-messages';

/** Builds the engine of each instrument, for the processor (and tests). */
export const ENGINES: Readonly<Record<VoiceInstrument, (sampleRate: number) => VoiceDsp>> = {
  bass: createBassEngine,
  synth: createSynthEngine,
  lead: createLeadEngine,
};
