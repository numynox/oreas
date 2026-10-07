import * as maplibregl from 'maplibre-gl';
import type { RequestTransformFunction } from 'maplibre-gl';
import { loadMapResource } from './mapCache';
// MapLibre v6 ships its worker as a separate ES module; let Vite bundle it (with its shared chunk)
// and hand MapLibre the resulting URL. Works in dev and in the static build.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

/**
 * Offline map.
 *
 * Map resource URLs are rewritten to the `oreas://` protocol, which MapLibre resolves on the main
 * thread (also for tiles requested by its web worker). The handler serves them from the offline map
 * cache (see mapCache.ts), so the map works offline whether or not the service worker intercepts the
 * request: it does not for an uncontrolled page, and some browsers (notably Safari on iOS) do not
 * route a web worker's requests through it at all.
 */
const PROTOCOL = 'oreas';
const MAP_RESOURCES = new Set(['Style', 'Source', 'Tile', 'Glyphs', 'SpriteJSON', 'SpriteImage']);

maplibregl.addProtocol(PROTOCOL, async (params, abortController) => {
  const url = `https${params.url.slice(PROTOCOL.length)}`;
  const res = await loadMapResource(url, abortController.signal);
  if (!res.ok) {
    // MapLibre treats a 404 tile as empty and anything else as an error.
    throw Object.assign(new Error(`${res.status} ${res.statusText}: ${url}`), { status: res.status, url });
  }
  const data = params.type === 'json' ? await res.json() : params.type === 'string' ? await res.text() : await res.arrayBuffer();
  return { data, cacheControl: res.headers.get('Cache-Control'), expires: res.headers.get('Expires') };
});

/** Route map resources through the `oreas://` protocol (see above). */
export const transformRequest: RequestTransformFunction = (url, type) =>
  type && MAP_RESOURCES.has(type) && url.startsWith('https://') ? { url: `${PROTOCOL}${url.slice('https'.length)}` } : { url };

export { maplibregl };
