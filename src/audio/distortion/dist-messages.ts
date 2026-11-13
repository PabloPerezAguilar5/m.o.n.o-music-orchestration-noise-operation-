import type { DistSettings } from '../../core/dist';

/** Name the DISTORSIÓN processor registers in the AudioWorklet. */
export const DIST_PROCESSOR = 'mono-dist';

/** Main thread → DISTORSIÓN processor. */
export type DistMessage = { readonly type: 'params'; readonly settings: DistSettings };
