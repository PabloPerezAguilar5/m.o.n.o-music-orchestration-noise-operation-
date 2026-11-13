const loads = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/**
 * Loads an AudioWorklet module into a context, once per context and URL. Rejects where
 * AudioWorklet is missing (e.g. a page not served from https or localhost).
 */
export function loadWorklet(context: BaseAudioContext, url: string): Promise<void> {
  let byUrl = loads.get(context);
  if (!byUrl) {
    byUrl = new Map();
    loads.set(context, byUrl);
  }
  let load = byUrl.get(url);
  if (!load) {
    load = context.audioWorklet
      ? context.audioWorklet.addModule(url)
      : Promise.reject(new Error('AudioWorklet no disponible'));
    byUrl.set(url, load);
  }
  return load;
}
