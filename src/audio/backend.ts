import type { AudioScene, AudioStatus } from '../core/audio-scene';
import type { LiveEvent } from '../core/live-events';
import type { NodeId } from '../core/nodes';

/** A step reaching the listener at the moment it is heard. */
export interface StepEvent {
  /** 0..15 */
  readonly step: number;
  /** Nodes that actually played something on this step. */
  readonly sounding: readonly NodeId[];
}

export type StepListener = (event: StepEvent) => void;
export type StatusListener = (status: AudioStatus) => void;
/** A stretch of the LFO's wave (-1..1, before CANTIDAD), LFO_TRACE_RATE values a second. */
export type LfoTraceListener = (values: Float32Array) => void;

/**
 * Boundary between the app and whatever produces sound and musical time.
 * The app only describes what should sound (AudioScene); the backend owns the clock.
 */
export interface AudioBackend {
  /**
   * Wakes the audio up. Browsers only allow it inside a user gesture, so it must be
   * called synchronously from one; calling it again after it runs is harmless.
   */
  unlock(): void;
  /** Starts the transport from step 0 of a new bar. `onStep` fires as each step is heard. */
  start(onStep: StepListener): void;
  stop(): void;
  /** New desired state. Structural changes wait for the next bar while playing. */
  update(scene: AudioScene): void;
  /**
   * Plays a live event (a LEAD note, a DRONE layer) right away, playing or not. Nothing
   * is scheduled on the clock: the instrument is being played by hand.
   */
  perform(event: LiveEvent): void;
  /** Plays one kick of a kit right away, to hear it (playing or not). Loads the kit if needed. */
  audition(kit: string): void;
  /** Status changes (audio running, kits available, failed files). Returns an unsubscribe function. */
  onStatus(listener: StatusListener): () => void;
  /** The LFO's wave as it runs, for the display and the knob rings. Returns an unsubscribe function. */
  onLfoTrace(listener: LfoTraceListener): () => void;
}
