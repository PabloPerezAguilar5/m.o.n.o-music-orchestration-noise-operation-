import { WebAudioBackend } from './audio/web-audio-backend';
import { hasPatchLink } from './core/patch-link';
import { activity, cues, lfoMonitor, live, patches, pulse, sliceMonitor, store } from './state';
import { linkAudio } from './state/audio-link';
import { TEXT } from './ui/labels';
import './ui/mono-app';

const backend = new WebAudioBackend();
linkAudio(store, backend, pulse, cues, live);
// The LFO's wave, for the display, the knob rings and its node's glow.
backend.onLfoTrace((values) => lfoMonitor.push(values));
// Each BASS loop's shape as it is decoded, for the SLICE wave strip.
backend.onSliceWave((wave) => sliceMonitor.set(wave));

// Browsers only let audio start inside a user gesture. The first touch anywhere
// (the + button, play, anything) wakes it up; later touches retry if it was blocked.
const unlock = (): void => backend.unlock();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

/**
 * The session comes back from the last visit; a link's patch loads on top of it (the
 * session is kept as "Antes del link" first). Neither starts the sound: the browser
 * only allows that after a touch. Then the session is saved as it changes.
 */
void (async () => {
  const restored = await patches.restoreSession();
  if (hasPatchLink(location.hash)) {
    await patches.openLink(location.hash);
    // The link did its job: a reload must not load it again.
    history.replaceState(null, '', location.pathname + location.search);
  } else if (restored) {
    cues.send({ type: 'notice', text: TEXT.sessionRestored });
  }
  patches.watch();
  await patches.refresh();
})();

// A link pasted into this same tab (only the hash changes: no reload) loads too.
window.addEventListener('hashchange', () => {
  if (!hasPatchLink(location.hash)) return;
  void patches.openLink(location.hash).then(() => {
    history.replaceState(null, '', location.pathname + location.search);
  });
});

if (import.meta.env.DEV) {
  // Probe for the browser tests (dev server only): is sound coming out of the master?
  Object.assign(window, {
    __mono: {
      level: () => backend.level(),
      mix: () => backend.mix(),
      clickLevel: () => backend.clickLevel(),
      cables: () => backend.cables(),
      lfo: () => (lfoMonitor.running ? lfoMonitor.latest() : null),
      store,
      activity,
      live,
      patches,
    },
  });
}
