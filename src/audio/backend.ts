/** Called once per sixteenth-note step (0..15) as the transport advances. */
export type StepListener = (step: number) => void;

/**
 * Boundary between the app and whatever produces sound and musical time.
 * Minimal for stage 1 (transport only); it grows with the audio graph.
 */
export interface AudioBackend {
  start(onStep: StepListener): void;
  stop(): void;
  setBpm(bpm: number): void;
}
