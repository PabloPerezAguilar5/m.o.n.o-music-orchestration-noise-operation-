/**
 * One-shot requests for the audio that are not state: nothing is stored, nothing is
 * saved. The UI sends them; audio-link hands them to the backend.
 */

export type Cue =
  /** Play one sample hit of a kit right away, to hear it. */
  { readonly type: 'audition'; readonly kit: string };

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
