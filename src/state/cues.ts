/**
 * One-shot messages that are not state: nothing is stored, nothing is saved. The UI
 * sends them; audio-link hands the audio ones to the backend, the panel shows notices.
 */

export type Cue =
  /** Play one sample hit of a kit right away, to hear it. */
  | { readonly type: 'audition'; readonly kit: string }
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
