import type { NodeId } from '../core/nodes';
import { Activity } from './activity';
import { Cues } from './cues';
import { LFO_TRACE_RATE } from '../core/lfo';
import { LfoMonitor } from './lfo-monitor';
import { Live } from './live';
import { SliceMonitor } from './slice-monitor';
import { Store } from './store';

export { Activity } from './activity';
export { Cues, type Cue } from './cues';
export { LfoMonitor } from './lfo-monitor';
export { SliceMonitor } from './slice-monitor';
export { Live, type LiveState } from './live';
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

/** The LFO's wave as it runs, for drawing. */
export const lfoMonitor = new LfoMonitor(LFO_TRACE_RATE);

/** The shape of each BASS loop decoded so far, for the SLICE wave strip. */
export const sliceMonitor = new SliceMonitor();

/** LEAD and DRONE, played by hand. */
export const live = new Live(store, { pulse, hold: (id, on) => activity.hold(id, on) });
