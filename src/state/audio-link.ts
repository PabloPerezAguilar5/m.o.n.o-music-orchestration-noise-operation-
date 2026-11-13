import type { AudioBackend, StepEvent } from '../audio/backend';
import { pulsesAt } from '../core/activity';
import type { NodeId } from '../core/nodes';
import type { Cues } from './cues';
import type { Live } from './live';
import { sceneFromState } from './scene';
import type { Store } from './store';

/**
 * Keeps an audio backend in step with the store, both ways: every state change goes
 * out as a scene and starts or stops the transport; steps and status come back in.
 * One-shot cues (a kit's sample hit) and live events (LEAD notes, DRONE layers) are
 * passed straight through.
 * Returns a function that undoes the link.
 */
export function linkAudio(
  store: Store,
  backend: AudioBackend,
  pulse: (id: NodeId, ms: number) => void,
  cues?: Cues,
  live?: Live,
): () => void {
  const onStep = (event: StepEvent): void => {
    store.setStep(event.step);
    for (const { id, ms } of pulsesAt(event.step, event.sounding)) pulse(id, ms);
  };

  let playing = false;
  let sent: readonly unknown[] = [];
  const sync = (): void => {
    const state = store.getState();
    // Only what sounds: the playhead moving every step must not resend the scene.
    const audible = [
      state.added,
      state.params.master,
      state.params.drum,
      state.drum,
      state.params.bass,
      state.bass,
      state.params.synth,
      state.synth,
      state.params.lead,
      state.params.drone,
      state.drone.preset,
      state.key,
      state.cables,
      state.params.dist,
      state.distType,
      state.params.lfo,
      state.lfo,
      state.transport.bpm,
      state.metronome,
    ];
    if (audible.some((value, i) => value !== sent[i])) {
      sent = audible;
      backend.update(sceneFromState(state));
    }
    if (state.transport.playing !== playing) {
      playing = state.transport.playing;
      if (playing) backend.start(onStep);
      else backend.stop();
    }
  };

  const unsubscribeStatus = backend.onStatus((status) => store.setAudioStatus(status));
  const unsubscribeStore = store.subscribe(sync);
  const unsubscribeCues = cues?.listen((cue) => {
    if (cue.type === 'audition') backend.audition(cue.kit);
  });
  const unsubscribeLive = live?.listen((event) => backend.perform(event));
  sync();
  return () => {
    unsubscribeLive?.();
    unsubscribeCues?.();
    unsubscribeStore();
    unsubscribeStatus();
    if (playing) backend.stop();
  };
}
