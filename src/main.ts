import type { AudioBackend } from './audio/backend';
import { SilentBackend } from './audio/silent-backend';
import { pulsesAt } from './core/activity';
import { pulse, store } from './state';
import './ui/mono-app';

// Stage 1 has no sound: the backend only keeps musical time for the playhead.
const backend: AudioBackend = new SilentBackend(store.getState().transport.bpm);

const onStep = (step: number): void => {
  store.setStep(step);
  for (const { id, ms } of pulsesAt(step, store.getState().patterns)) pulse(id, ms);
};

// Keep the backend in step with the transport state.
let { playing, bpm } = store.getState().transport;
store.subscribe(() => {
  const transport = store.getState().transport;
  if (transport.bpm !== bpm) {
    bpm = transport.bpm;
    backend.setBpm(bpm);
  }
  if (transport.playing !== playing) {
    playing = transport.playing;
    if (playing) backend.start(onStep);
    else backend.stop();
  }
});
