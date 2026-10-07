import { fetchAndStore, MAP_CACHES } from './mapCache';

/**
 * Offline basemap.
 *
 * Every map request is cached as you go (mapCache.ts, and the service worker when it intercepts).
 * This module adds a bulk download of the area covered by the trip's activities: an overview of their
 * bounding box at low zoom plus street-level tiles around each place, stored in the same map cache.
 *
 * Only OpenFreeMap (Streets, Minimal, Railways base, Terrain base) is pre-downloaded; the raster
 * styles (Topographic, Aerial, GSI, hillshade, railway overlay) are only cached as you view them.
 */

const OFM = 'https://tiles.openfreemap.org';
const STYLES = ['liberty', 'dark', 'positron', 'fiord'].map((s) => `${OFM}/styles/${s}`);
/** Glyph ranges U+0000–U+21FF (Latin, Greek, Cyrillic, most alphabets, punctuation). CJK is drawn with local fonts by MapLibre. */
const GLYPH_RANGES = Array.from({ length: 34 }, (_, i) => `${i * 256}-${i * 256 + 255}`);
/** Upper bound for the overview of the whole area (tiles over all overview zooms). */
const OVERVIEW_BUDGET = 3000;
const OVERVIEW_MAX_ZOOM = 10;
/** Up to this zoom the overview also covers the surroundings (cheap, avoids blank edges when zoomed out). */
const CONTEXT_MAX_ZOOM = 6;
const CONTEXT_DEG = 10;
/** Street-level detail around each place: [zoom, radius in km]. */
const DETAIL: [number, number][] = [
  [11, 5],
  [12, 5],
  [13, 1.5],
  [14, 1.5],
];
const CONCURRENCY = 6;
const SUMMARY_KEY = 'oreas:v1:offline-map';

export interface Point {
  lat: number;
  lng: number;
}

interface Tile {
  z: number;
  x: number;
  y: number;
}

export interface MapDownloadSummary {
  at: number;
  tiles: number;
  failed: number;
  bytes: number;
  places: number;
}

const clampLat = (lat: number) => Math.max(-85.0511, Math.min(85.0511, lat));
const tileX = (lng: number, z: number) => Math.min(2 ** z - 1, Math.max(0, Math.floor(((lng + 180) / 360) * 2 ** z)));
function tileY(lat: number, z: number): number {
  const r = (clampLat(lat) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  return Math.min(2 ** z - 1, Math.max(0, y));
}

interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

function tilesInBox(b: Box, z: number): Tile[] {
  const out: Tile[] = [];
  const [x0, x1] = [tileX(b.west, z), tileX(b.east, z)];
  const [y0, y1] = [tileY(b.north, z), tileY(b.south, z)];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  return out;
}

function countInBox(b: Box, z: number): number {
  return (tileX(b.east, z) - tileX(b.west, z) + 1) * (tileY(b.south, z) - tileY(b.north, z) + 1);
}

function boundsOf(points: Point[]): Box {
  let [west, south, east, north] = [180, 90, -180, -90];
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const padLat = Math.max(0.5, (north - south) * 0.15);
  const padLng = Math.max(0.5, (east - west) * 0.15);
  return {
    west: Math.max(-180, west - padLng),
    east: Math.min(180, east + padLng),
    south: clampLat(south - padLat),
    north: clampLat(north + padLat),
  };
}

function grow(b: Box, deg: number): Box {
  return {
    west: Math.max(-180, b.west - deg),
    east: Math.min(180, b.east + deg),
    south: clampLat(b.south - deg),
    north: clampLat(b.north + deg),
  };
}

function around(p: Point, km: number): Box {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)));
  return { west: p.lng - dLng, east: p.lng + dLng, south: clampLat(p.lat - dLat), north: clampLat(p.lat + dLat) };
}

export interface TilePlan {
  /** Vector tiles (OpenFreeMap planet). */
  tiles: Tile[];
  /** Natural Earth relief used by the Streets style at low zoom. */
  relief: Tile[];
  overviewZoom: number;
}

/** Tiles covering the activity area: overview of the bounding box + detail around each place. */
export function planTiles(points: Point[]): TilePlan {
  if (!points.length) return { tiles: [], relief: [], overviewZoom: 0 };
  const box = boundsOf(points);
  const context = grow(box, CONTEXT_DEG);
  const boxAt = (z: number) => (z <= CONTEXT_MAX_ZOOM ? context : box);
  let overviewZoom = 0;
  let total = 0;
  for (let z = 0; z <= OVERVIEW_MAX_ZOOM; z++) {
    total += countInBox(boxAt(z), z);
    if (total > OVERVIEW_BUDGET) break;
    overviewZoom = z;
  }
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  const add = (t: Tile) => {
    const k = `${t.z}/${t.x}/${t.y}`;
    if (!seen.has(k)) {
      seen.add(k);
      tiles.push(t);
    }
  };
  for (let z = 0; z <= overviewZoom; z++) tilesInBox(boxAt(z), z).forEach(add);
  for (const p of points) {
    // Fill the zooms between the overview and the detail levels around each place, too.
    for (let z = overviewZoom + 1; z < DETAIL[0][0]; z++) tilesInBox(around(p, DETAIL[0][1]), z).forEach(add);
    for (const [z, km] of DETAIL) if (z > overviewZoom) tilesInBox(around(p, km), z).forEach(add);
  }
  const relief: Tile[] = [];
  for (let z = 0; z <= Math.min(6, overviewZoom); z++) relief.push(...tilesInBox(boxAt(z), z));
  return { tiles, relief, overviewZoom };
}

/** Distinct font stacks used by a style's symbol layers (literal `text-font` arrays only). */
function fontStacks(style: { layers?: { layout?: Record<string, unknown> }[] }): string[] {
  const out = new Set<string>();
  for (const l of style.layers ?? []) {
    const f = l.layout?.['text-font'];
    if (Array.isArray(f) && f.every((s) => typeof s === 'string')) out.add(f.join(','));
  }
  return [...out];
}

function loadSummary(): MapDownloadSummary | null {
  try {
    return JSON.parse(localStorage.getItem(SUMMARY_KEY) ?? 'null');
  } catch {
    return null;
  }
}

class OfflineMap {
  /** A service worker controls this page (required for offline map tiles and the app shell). */
  controlled = $state(typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller);
  supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined';
  progress = $state<{ done: number; total: number; failed: number; bytes: number } | null>(null);
  /** Number of map requests in the tile caches (null = unknown). */
  cachedTiles = $state<number | null>(null);
  last = $state<MapDownloadSummary | null>(loadSummary());
  /** Storage persistence: true/false, or null when the browser cannot tell. */
  persisted = $state<boolean | null>(null);
  private abort = false;

  constructor() {
    if (typeof navigator !== 'undefined') {
      navigator.serviceWorker?.addEventListener('controllerchange', () => (this.controlled = !!navigator.serviceWorker.controller));
    }
  }

  async refresh() {
    try {
      let n = 0;
      for (const name of MAP_CACHES) if (await caches.has(name)) n += (await (await caches.open(name)).keys()).length;
      this.cachedTiles = n;
    } catch {
      this.cachedTiles = null; // Cache API unavailable (e.g. some private windows)
    }
    try {
      this.persisted = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
      this.persisted = null;
    }
  }

  /**
   * Ask the browser not to evict our caches. Chrome decides silently (installed / engaged sites get it),
   * Firefox asks the user, Safari grants it to home-screen apps.
   */
  async persist(): Promise<boolean | null> {
    try {
      if (!navigator.storage?.persist) return null;
      this.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    } catch {
      this.persisted = null;
    }
    return this.persisted;
  }

  async download(points: Point[]): Promise<MapDownloadSummary | null> {
    if (this.progress || !this.supported) return null;
    this.abort = false;
    const plan = planTiles(points);
    const urls: string[] = [];
    // Styles and the TileJSON first: the service worker keeps them for offline starts.
    const tileJson = (await (await fetchAndStore(`${OFM}/planet`)).json()) as { tiles: string[] };
    const template = tileJson.tiles[0];
    for (const s of STYLES) {
      const style = await (await fetchAndStore(s)).json();
      const sprite = typeof style.sprite === 'string' ? style.sprite : undefined;
      if (sprite) for (const suf of ['', '@2x']) urls.push(`${sprite}${suf}.json`, `${sprite}${suf}.png`);
      const glyphs: string | undefined = style.glyphs;
      if (glyphs)
        for (const stack of fontStacks(style))
          for (const r of GLYPH_RANGES) urls.push(glyphs.replace('{fontstack}', stack).replace('{range}', r));
    }
    const fill = (tpl: string, t: Tile) => tpl.replace('{z}', `${t.z}`).replace('{x}', `${t.x}`).replace('{y}', `${t.y}`);
    for (const t of plan.relief) urls.push(fill(`${OFM}/natural_earth/ne2sr/{z}/{x}/{y}.png`, t));
    for (const t of plan.tiles) urls.push(fill(template, t));
    const todo = [...new Set(urls)];

    const state = { done: 0, total: todo.length, failed: 0, bytes: 0 };
    this.progress = { ...state };
    let i = 0;
    const worker = async () => {
      while (i < todo.length && !this.abort) {
        const url = todo[i++];
        try {
          const res = await fetchAndStore(url);
          // Empty ocean tiles may come back as 204; anything else non-OK counts as failed.
          if (!res.ok) state.failed++;
          else state.bytes += (await res.arrayBuffer()).byteLength;
        } catch {
          state.failed++;
        }
        state.done++;
        this.progress = { ...state };
      }
    };
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } finally {
      this.progress = null;
    }
    const summary: MapDownloadSummary = {
      at: Date.now(),
      tiles: state.done - state.failed,
      failed: state.failed,
      bytes: state.bytes,
      places: points.length,
    };
    if (!this.abort) {
      this.last = summary;
      try {
        localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
      } catch {
        /* ignore */
      }
    }
    await this.refresh();
    return summary;
  }

  cancel() {
    this.abort = true;
  }

  async clear() {
    this.cancel();
    try {
      for (const name of MAP_CACHES) await caches.delete(name);
    } catch {
      /* ignore */
    }
    this.last = null;
    try {
      localStorage.removeItem(SUMMARY_KEY);
    } catch {
      /* ignore */
    }
    await this.refresh();
  }
}

export const offlineMap = new OfflineMap();
