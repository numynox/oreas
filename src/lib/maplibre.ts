import * as maplibregl from 'maplibre-gl';
import type { RequestTransformFunction } from 'maplibre-gl';
// MapLibre v6 ships its worker as a separate ES module; let Vite bundle it (with its shared chunk)
// and hand MapLibre the resulting URL. Works in dev and in the static build.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

/**
 * Offline tiles.
 *
 * MapLibre fetches vector tiles inside its web worker. Not every browser routes a worker's requests
 * through the page's service worker (notably Safari on iOS), so tiles that are in the offline cache
 * were never found there and the map stayed blank offline. Tile URLs are therefore rewritten to the
 * `oreas://` protocol, which MapLibre resolves on the main thread: the handler reads the map caches
 * directly (same keys as src/service-worker.js) and only then goes to the network (through the
 * service worker, which keeps caching what it fetches).
 */
const PROTOCOL = 'oreas';
const MAP_CACHES = ['oreas-map-ofm', 'oreas-map-raster'];

/** Cache key as written by the service worker (OpenFreeMap vector tiles without the weekly build segment). */
function cacheKey(url: URL): string {
  if (url.hostname === 'tiles.openfreemap.org') {
    const m = url.pathname.match(/^\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/);
    if (m) return `${url.origin}/planet/${m[1]}`;
  }
  return url.href;
}

async function fromCache(url: URL): Promise<Response | undefined> {
  if (typeof caches === 'undefined') return undefined;
  const key = cacheKey(url);
  try {
    for (const name of MAP_CACHES) {
      const hit = await caches.match(key, { cacheName: name });
      if (hit) return hit;
    }
  } catch {
    /* Cache API unavailable (e.g. some private windows) */
  }
  return undefined;
}

const result = async (res: Response) => ({
  data: await res.arrayBuffer(),
  cacheControl: res.headers.get('Cache-Control'),
  expires: res.headers.get('Expires'),
});

maplibregl.addProtocol(PROTOCOL, async (params, abortController) => {
  const url = new URL(`https${params.url.slice(PROTOCOL.length)}`);
  const cached = await fromCache(url);
  if (cached) return result(cached);
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: abortController.signal });
  if (!res.ok) {
    // MapLibre treats a 404 as an empty tile and anything else as an error.
    throw Object.assign(new Error(`${res.status} ${res.statusText}: ${url.href}`), { status: res.status, url: url.href });
  }
  return result(res);
});

/** Route tile requests through the `oreas://` protocol (see above). */
export const transformRequest: RequestTransformFunction = (url, type) =>
  type === 'Tile' && url.startsWith('https://') ? { url: `${PROTOCOL}${url.slice('https'.length)}` } : { url };

export { maplibregl };
