/* Oreas service worker (classic script, works in every browser incl. Firefox).
 *
 * The build (vite.config.ts → oreasServiceWorker) replaces the two placeholders below with the
 * build hash and the list of emitted files, and writes the result to dist/sw.js.
 *
 * - App shell: precached on install, served cache-first; navigations are network-first with the
 *   cached index.html as offline fallback.
 * - /config.json: network-first, so proxy mode still works offline.
 * - OpenFreeMap: style/TileJSON network-first; tiles, glyphs and sprites cache-first ("cache as you go").
 *   Vector tile URLs contain a weekly build version, which is stripped from the cache key so tiles
 *   cached from an older build keep working.
 * - Other tile servers (topo, terrain, railways, GSI): cache-first in a size-limited cache.
 * - Airtable API calls and images are left alone (the app has its own caches for those).
 */
const VERSION = '__OREAS_VERSION__';
const PRECACHE = /** @type {string[]} */ (__OREAS_PRECACHE__);

const SHELL = `oreas-shell-${VERSION}`;
const DATA = 'oreas-data';
const OFM = 'oreas-map-ofm';
const RASTER = 'oreas-map-raster';
const RASTER_MAX = 4000;
const NETWORK_TIMEOUT = 4000;
const KEEP = [SHELL, DATA, OFM, RASTER];

const RASTER_HOSTS = /(^|\.)(opentopomap\.org|openrailwaymap\.org|cyberjapandata\.gsi\.go\.jp|elevation-tiles-prod\.s3\.amazonaws\.com)$/;
const isRasterTile = (url) =>
  RASTER_HOSTS.test(url.hostname) || (url.hostname === 's3.amazonaws.com' && url.pathname.startsWith('/elevation-tiles-prod/'));

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE.map((p) => new Request(new URL(p, sw.registration.scope), { cache: 'reload' }))))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('oreas-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

/** Cache key for OpenFreeMap: drop the weekly build segment of vector tile URLs. */
function ofmKey(url) {
  const m = url.pathname.match(/^\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/);
  return m ? `${url.origin}/planet/${m[1]}` : url.href;
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function put(cacheName, key, res) {
  if (!res.ok) return;
  const c = await caches.open(cacheName);
  await c.put(key, res);
  if (cacheName === RASTER && Math.random() < 0.02) await trim(c, RASTER_MAX);
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); // oldest entries first
}

async function cacheFirst(event, cacheName, key) {
  const hit = await caches.match(key, { cacheName });
  if (hit) return hit;
  const res = await fetch(event.request);
  event.waitUntil(put(cacheName, key, res.clone()).catch(() => undefined));
  return res;
}

async function networkFirst(event, cacheName, key) {
  try {
    const res = await Promise.race([fetch(event.request), timeout(NETWORK_TIMEOUT)]);
    if (res.ok) event.waitUntil(put(cacheName, key, res.clone()).catch(() => undefined));
    return res;
  } catch (e) {
    const hit = await caches.match(key, { cacheName });
    if (hit) return hit;
    throw e;
  }
}

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(sw.registration.scope);

  if (url.origin === scope.origin) {
    if (!url.pathname.startsWith(scope.pathname) || url.pathname.startsWith(`${scope.pathname}api/`)) return;
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(event, SHELL, new URL('index.html', scope).href));
      return;
    }
    if (url.pathname === `${scope.pathname}config.json`) {
      event.respondWith(networkFirst(event, DATA, url.origin + url.pathname));
      return;
    }
    event.respondWith(cacheFirst(event, SHELL, url.origin + url.pathname));
    return;
  }

  if (url.hostname === 'tiles.openfreemap.org') {
    // Styles and the TileJSON have no file extension; they change with each OpenFreeMap release.
    const dynamic = url.pathname.startsWith('/styles/') || !/\.[a-z0-9]+$/i.test(url.pathname);
    event.respondWith(dynamic ? networkFirst(event, OFM, url.href) : cacheFirst(event, OFM, ofmKey(url)));
    return;
  }

  if (isRasterTile(url)) event.respondWith(cacheFirst(event, RASTER, url.href));
});
