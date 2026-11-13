import type { DroneLayerEvent } from './drone';
import type { LeadNoteEvent } from './lead';

/**
 * What the live instruments ask of the audio, as they are played (not scheduled on the
 * clock): LEAD notes and DRONE layers. The audio plays each one as soon as it arrives.
 */
export type LiveEvent =
  | ({ readonly node: 'lead' } & LeadNoteEvent)
  /** Releases every LEAD note at once. */
  | { readonly node: 'lead'; readonly type: 'panic' }
  | ({ readonly node: 'drone' } & DroneLayerEvent)
  /** STOP: every layer fades out with its release; the effect tails ring on. */
  | { readonly node: 'drone'; readonly type: 'stop' }
  /** CLEAR: silence now, effect tails included. */
  | { readonly node: 'drone'; readonly type: 'clear' };
