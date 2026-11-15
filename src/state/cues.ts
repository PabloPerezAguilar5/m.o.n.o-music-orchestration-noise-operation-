import type { BassLoop } from '../core/slice';

/**
 * One-shot messages that are not state: nothing is stored, nothing is saved. The UI
 * sends them; audio-link hands the audio ones to the backend, the panel shows notices.
 */

export type Cue =
  /** Play one sample hit of a kit right away, to hear it. */
  | { readonly type: 'audition'; readonly kit: string }
  /** Play the start of a BASS loop right away, to hear it (loads it if needed). */
  | { readonly type: 'loop-preview'; readonly loop: BassLoop }
  /** Play one piece (0..15) of the BASS loop right away, to hear it. */
  | { readonly type: 'slice-preview'; readonly slice: number }
  /** Play one note (a scale step, 0..9) of the SYNTH right away with its current sound, to hear it. */
  | { readonly type: 'synth-preview'; readonly note: number }
  /** A line for the display (a cable made, or why it could not be). */
  | { readonly type: 'notice'; readonly text: string };

export type CueListener = (cue: Cue) => void;

export class Cues {
  private readonly listeners = new Set<CueListener>();

  send(cue: Cue): void {
    for (const listener of [...this.listeners]) listener(cue);
  }

  /** Returns an unsubscribe function. */
  listen(listener: CueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
