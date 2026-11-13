import { WebAudioBackend } from './audio/web-audio-backend';
import { activity, cues, live, pulse, store } from './state';
import { linkAudio } from './state/audio-link';
import './ui/mono-app';

const backend = new WebAudioBackend();
linkAudio(store, backend, pulse, cues, live);

// Browsers only let audio start inside a user gesture. The first touch anywhere
// (the + button, play, anything) wakes it up; later touches retry if it was blocked.
const unlock = (): void => backend.unlock();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

if (import.meta.env.DEV) {
  // Probe for the browser tests (dev server only): is sound coming out of the master?
  Object.assign(window, {
    __mono: {
      level: () => backend.level(),
      mix: () => backend.mix(),
      clickLevel: () => backend.clickLevel(),
      store,
      activity,
      live,
    },
  });
}
