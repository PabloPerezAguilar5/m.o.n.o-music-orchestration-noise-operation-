import type { NodeId } from '../core/nodes';
import { Activity } from './activity';
import { Cues } from './cues';
import { Store } from './store';

export { Activity } from './activity';
export { Cues, type Cue } from './cues';
export { Store } from './store';
export type { Source } from './emitter';
export type { AppState, ParamValues, TransportState } from './types';

/** The app's single store and activity tracker. */
export const store = new Store();
export const activity = new Activity();
export const cues = new Cues();

/** Lights a node up briefly, if it is on the canvas. */
export function pulse(id: NodeId, ms?: number): void {
  if (store.getState().added.includes(id)) activity.pulse(id, ms);
}
