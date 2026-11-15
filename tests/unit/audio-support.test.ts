import { describe, expect, it } from 'vitest';
import { audioProblem } from '../../src/core/audio-support';
import { detectAudioEnv } from '../../src/audio/support';

describe('audioProblem', () => {
  it('says nothing when audio and AudioWorklet are there', () => {
    expect(audioProblem({ audioContext: true, audioWorklet: true, secureContext: true })).toBeNull();
  });

  it('no AudioContext: no Web Audio, whatever the page', () => {
    expect(audioProblem({ audioContext: false, audioWorklet: false, secureContext: true })).toBe('no-web-audio');
    expect(audioProblem({ audioContext: false, audioWorklet: false, secureContext: false })).toBe('no-web-audio');
  });

  it('no AudioWorklet on an insecure page: open it from https or localhost', () => {
    expect(audioProblem({ audioContext: true, audioWorklet: false, secureContext: false })).toBe('insecure-context');
  });

  it('no AudioWorklet on a secure page: the browser is too old', () => {
    expect(audioProblem({ audioContext: true, audioWorklet: false, secureContext: true })).toBe('no-worklet');
  });
});

describe('detectAudioEnv', () => {
  class FakeContext {
    get audioWorklet(): object {
      return {};
    }
  }
  it('reads the browser: worklet needs both the node and the context property', () => {
    const full = detectAudioEnv({ AudioContext: FakeContext, AudioWorkletNode: class {}, isSecureContext: true });
    expect(full).toEqual({ audioContext: true, audioWorklet: true, secureContext: true });
    // Insecure pages expose neither AudioWorkletNode nor audioWorklet.
    class Bare {}
    const insecure = detectAudioEnv({ AudioContext: Bare, isSecureContext: false });
    expect(insecure).toEqual({ audioContext: true, audioWorklet: false, secureContext: false });
    expect(audioProblem(insecure)).toBe('insecure-context');
  });

  it('no AudioContext at all, and a browser without isSecureContext counts as secure', () => {
    const env = detectAudioEnv({});
    expect(env).toEqual({ audioContext: false, audioWorklet: false, secureContext: true });
    expect(audioProblem(env)).toBe('no-web-audio');
  });
});
