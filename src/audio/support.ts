import { audioProblem, type AudioEnv, type AudioProblem } from '../core/audio-support';

/** Reads what this browser offers. `scope` is injectable for tests. */
export function detectAudioEnv(scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): AudioEnv {
  const context = scope.AudioContext;
  const hasContext = typeof context === 'function';
  const prototype = hasContext ? (context as { prototype?: object }).prototype : undefined;
  return {
    audioContext: hasContext,
    audioWorklet: typeof scope.AudioWorkletNode === 'function' && !!prototype && 'audioWorklet' in prototype,
    // Older browsers have no isSecureContext; there, assume the best.
    secureContext: scope.isSecureContext !== false,
  };
}

export const detectAudioProblem = (): AudioProblem | null => audioProblem(detectAudioEnv());
