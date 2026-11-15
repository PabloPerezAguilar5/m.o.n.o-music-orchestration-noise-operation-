/**
 * What this page can do with audio, decided from plain facts about the browser (so it is
 * testable without one). The sound of SYNTH, LEAD, BASS (303), DISTORSIÓN and the LFO
 * runs in an AudioWorklet, which browsers only offer on https or localhost.
 */

export type AudioProblem =
  /** No Web Audio at all: nothing can sound. */
  | 'no-web-audio'
  /** Page not on https or localhost: no AudioWorklet. DRUM, DRONE and BASS SLICE still play. */
  | 'insecure-context'
  /** A secure page, but the browser has no AudioWorklet (an old one). Same consequences. */
  | 'no-worklet';

export interface AudioEnv {
  /** AudioContext exists. */
  readonly audioContext: boolean;
  /** AudioWorkletNode exists and contexts have an audioWorklet. */
  readonly audioWorklet: boolean;
  /** The page is a secure context (https or localhost). */
  readonly secureContext: boolean;
}

/** What is wrong, or null when everything audio needs is there. */
export function audioProblem(env: AudioEnv): AudioProblem | null {
  if (!env.audioContext) return 'no-web-audio';
  if (!env.audioWorklet) return env.secureContext ? 'no-worklet' : 'insecure-context';
  return null;
}
