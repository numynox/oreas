/**
 * Map resources (styles, TileJSON, sprites, glyphs, tiles) read and written by the page itself.
 *
 * The service worker (src/service-worker.js) caches map requests too, but only for requests it
 * actually intercepts: not for a page it does not control (first visit, hard reload, a tab restored
 * by the browser while offline) and, in some browsers, not for requests from MapLibre's web worker.
 * Offline data and images never depended on the service worker, so the map should not either: the
 * map loads everything through this module (see maplibre.ts), which reads the same caches directly.
 * Keys and cache names match the service worker, so either side finds what the other stored.
 */

export const MAP_CACHES = ['oreas-map-ofm', 'oreas-map-raster'] as const;
const NETWORK_TIMEOUT = 4000;

const isOfm = (url: URL) => url.hostname === 'tiles.openfreemap.org';

/** Cache key: OpenFreeMap vector tiles without the weekly build segment (as in the service worker). */
export function cacheKey(url: URL): string {
  if (isOfm(url)) {
    const m = url.pathname.match(/^\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/);
    if (m) return `${url.origin}/planet/${m[1]}`;
  }
  return url.href;
}

const cacheName = (url: URL) => (isOfm(url) ? MAP_CACHES[0] : MAP_CACHES[1]);

/** OpenFreeMap styles and the TileJSON change with each release: prefer the network for them. */
const isDynamic = (url: URL) => isOfm(url) && (url.pathname.startsWith('/styles/') || !/\.[a-z0-9]+$/i.test(url.pathname));

const hasCaches = () => typeof caches !== 'undefined';
/** A controlling service worker stores what we fetch; otherwise we store it ourselves. */
const swStores = () => typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

async function lookup(url: URL): Promise<Response | undefined> {
  if (!hasCaches()) return undefined;
  try {
    return await caches.match(cacheKey(url), { cacheName: cacheName(url) });
  } catch {
    return undefined; // Cache API unavailable (e.g. some private windows)
  }
}

async function store(url: URL, res: Response) {
  if (!hasCaches() || !res.ok) return;
  try {
    await (await caches.open(cacheName(url))).put(cacheKey(url), res);
  } catch {
    /* quota or private window: the map still works online */
  }
}

async function network(url: URL, signal?: AbortSignal, timeout?: number): Promise<Response> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  signal?.addEventListener('abort', abort);
  const timer = timeout ? setTimeout(abort, timeout) : undefined;
  try {
    return await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * Fetch a map resource and make sure it ends up in the map cache (used by the bulk download).
 * Returns the network response.
 */
export async function fetchAndStore(href: string, signal?: AbortSignal): Promise<Response> {
  const url = new URL(href);
  const res = await network(url, signal);
  if (res.ok && !swStores()) await store(url, res.clone());
  return res;
}

/**
 * Load a map resource: cache first for tiles, glyphs and sprites; network first (short timeout)
 * with the cache as fallback for styles and the TileJSON.
 */
export async function loadMapResource(href: string, signal?: AbortSignal): Promise<Response> {
  const url = new URL(href);
  if (!isDynamic(url)) {
    const hit = await lookup(url);
    if (hit) return hit;
    return fetchAndStore(href, signal);
  }
  try {
    const res = await network(url, signal, NETWORK_TIMEOUT);
    if (res.ok) {
      if (!swStores()) await store(url, res.clone());
      return res;
    }
    const hit = await lookup(url);
    return hit ?? res;
  } catch (e) {
    if (signal?.aborted) throw e;
    const hit = await lookup(url);
    if (hit) return hit;
    throw e;
  }
}
