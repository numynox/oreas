import { tick } from 'svelte';
import { AirtableError, fetchAllRecords, fetchSchema, updateRecord } from './airtable/client';
import { IMAGE_URL_TTL_MS, MAX_AGE_MS, clearAllCaches, loadCache, saveCache, type CacheEntry } from './airtable/cache';
import {
  buildConfig,
  isConfigComplete,
  loadLocalSettings,
  loadServerConfig,
  saveLocalSettings,
  type AppConfig,
  type LocalSettings,
  type ServerConfig,
} from './airtable/config';
import {
  DAY_FIELD_DEFS,
  TABLE_NAMES,
  loadMapping,
  resolveMapping,
  resolveTable,
  saveMapping,
  type DayKey,
  type FieldKey,
  type StoredMapping,
} from './airtable/fields';
import { daysBetween, isEmptyDay, scrollToDay, toDay, type Day } from './airtable/itinerary';
import type { AirtableRecord } from './airtable/types';
import { choicesOf, toActivity, type Activity } from './airtable/activities';
import { buildColorMap, NEUTRAL } from './colors';
import { images } from './images.svelte';
import { offlineMap, planTiles, type Point } from './offlineMap.svelte';
import type { AirtableAttachment } from './airtable/types';
import type { StyleId } from './mapStyles';

export type FacetKey = 'type' | 'status' | 'region' | 'priority' | 'access';

export const FACETS: { key: FacetKey; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'region', label: 'Region' },
  { key: 'priority', label: 'Priority' },
  { key: 'access', label: 'Access by' },
];

export interface FacetOption {
  value: string;
  count: number;
  color: string;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
  action?: { label: string; run: () => void };
}

export type Theme = 'system' | 'light' | 'dark';

const INACTIVE = /skip|deprecat|cancel/i;

export type Mode = 'explore' | 'itinerary';
const modeFromHash = (): Mode => (typeof location !== 'undefined' && location.hash === '#itinerary' ? 'itinerary' : 'explore');
/** Rating scale written to the priority field, lowest → highest. */
export const RATINGS = ['Low', 'Medium', 'High', 'Must have'];

interface PendingWrite {
  recordId: string;
  fieldId: string;
  value: unknown;
}
const pendingKey = (baseId: string) => `oreas:v1:pending:${baseId}`;

function loadPending(baseId: string): PendingWrite[] {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(baseId)) ?? '[]') as PendingWrite[];
  } catch {
    return [];
  }
}

/** Greedy nearest-neighbour tour (north → south start) so the map hops between close places. */
function tour(list: Activity[]): Activity[] {
  const placed = list.filter((a) => a.lat !== undefined);
  const rest = list.filter((a) => a.lat === undefined);
  const out: Activity[] = [];
  let cur = placed.sort((a, b) => b.lat! - a.lat!)[0];
  const left = new Set(placed);
  while (cur) {
    out.push(cur);
    left.delete(cur);
    let best: Activity | undefined;
    let bestD = Infinity;
    for (const c of left) {
      const d = (c.lat! - cur.lat!) ** 2 + ((c.lng! - cur.lng!) * Math.cos((cur.lat! * Math.PI) / 180)) ** 2;
      if (d < bestD) [best, bestD] = [c, d];
    }
    cur = best!;
  }
  return [...out, ...rest];
}
const UI_KEY = 'oreas:v1:ui';

export function facetValues(a: Activity, k: FacetKey): string[] {
  const v = a[k];
  return v ? [v] : [];
}

function loadUi(): { colorBy?: FacetKey; theme?: Theme; hideInactive?: boolean; mapStyle?: StyleId } {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const ui = loadUi();

class AppState {
  // ---- config & data -------------------------------------------------------
  server = $state<ServerConfig | null>(null);
  config = $state<AppConfig | null>(null);
  ready = $state(false);
  cache = $state<CacheEntry | null>(null);
  mapping = $state<StoredMapping>({ fields: {} });
  itineraryMapping = $state<StoredMapping<DayKey>>({ fields: {} });
  /** Which part of the app is shown: activity explorer or day-by-day itinerary. */
  mode = $state<Mode>(modeFromHash());
  /** Day selected in the itinerary (null = whole trip). */
  activeDayId = $state<string | null>(null);
  syncing = $state(false);
  imagesExpired = $state(false);
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  storage = $state<{ usage: number; quota: number } | null>(null);
  /** Writes not yet confirmed by Airtable (survive reloads / offline). */
  pending = $state<PendingWrite[]>([]);
  private flushing = false;
  /** Active rating session. */
  rating = $state<{ queue: string[]; index: number; rated: number } | null>(null);

  resolved = $derived.by(() => {
    if (!this.cache || !this.config) return null;
    return resolveMapping(this.cache.schema, TABLE_NAMES.activities, this.mapping);
  });

  resolvedDays = $derived.by(() => {
    if (!this.cache) return null;
    return resolveMapping(this.cache.schema, TABLE_NAMES.itinerary, this.itineraryMapping, DAY_FIELD_DEFS);
  });

  /** Itinerary days sorted by date (undated days last). Blank rows are ignored. */
  days = $derived.by<Day[]>(() => {
    const r = this.resolvedDays;
    const it = this.cache?.itinerary;
    if (!r?.table || r.blocking || !it || it.tableId !== r.table.id) return [];
    return it.records
      .map((rec) => toDay(rec, r))
      .filter((d) => !isEmptyDay(d))
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  });

  /** activity ID → days it is scheduled on. */
  scheduled = $derived.by(() => {
    const m = new Map<string, Day[]>();
    for (const d of this.days) for (const id of d.activityIds) m.set(id, [...(m.get(id) ?? []), d]);
    return m;
  });

  activities = $derived.by<Activity[]>(() => {
    const r = this.resolved;
    if (!r || !r.table || r.blocking || !this.cache || this.cache.tableId !== r.table.id) return [];
    return this.cache.records.map((rec) => toActivity(rec, r));
  });

  // ---- UI state ------------------------------------------------------------
  search = $state('');
  selected = $state<Record<FacetKey, string[]>>({ type: [], status: [], region: [], priority: [], access: [] });
  hideInactive = $state(ui.hideInactive ?? true);
  colorBy = $state<FacetKey>(ui.colorBy ?? 'type');
  selectedId = $state<string | null>(null);
  hoveredId = $state<string | null>(null);
  theme = $state<Theme>(ui.theme ?? 'system');
  // Read synchronously so the map starts with the right basemap.
  mapStyle = $state<StyleId>(ui.mapStyle ?? 'streets');
  systemDark = $state(typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  showSettings = $state(false);
  showMapping = $state(false);
  lightbox = $state<{ images: AirtableAttachment[]; index: number } | null>(null);
  toasts = $state<Toast[]>([]);
  now = $state(Date.now());

  dark = $derived(this.theme === 'dark' || (this.theme === 'system' && this.systemDark));

  /** Facet options (ordered, with counts over all active activities and colors). */
  facets = $derived.by(() => {
    const out = {} as Record<FacetKey, FacetOption[]>;
    const r = this.resolved;
    const pool = this.hideInactive ? this.activities.filter((a) => !this.isInactive(a)) : this.activities;
    for (const { key } of FACETS) {
      const field = r?.fields[key];
      const choices = choicesOf(field);
      const counts = new Map<string, number>();
      for (const a of pool) for (const v of facetValues(a, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
      for (const a of this.activities) for (const v of facetValues(a, key)) if (!counts.has(v)) counts.set(v, 0);
      const ordered = [
        ...choices.map((c) => c.name).filter((n) => counts.has(n)),
        ...[...counts.keys()].filter((n) => !choices.some((c) => c.name === n)).sort((a, b) => a.localeCompare(b)),
      ];
      const colors = buildColorMap(ordered, choices.length ? new Map(choices.map((c) => [c.name, c.color])) : undefined);
      out[key] = ordered.map((v) => ({ value: v, count: counts.get(v) ?? 0, color: colors.get(v) ?? NEUTRAL }));
    }
    return out;
  });

  filtered = $derived.by(() => {
    const q = this.search.trim().toLowerCase();
    return this.activities.filter((a) => {
      if (this.hideInactive && this.isInactive(a) && a.id !== this.selectedId) return false;
      for (const { key } of FACETS) {
        const sel = this.selected[key];
        if (sel.length && !facetValues(a, key).some((v) => sel.includes(v))) return false;
      }
      if (q) {
        const hay = [a.name, a.location, a.region, a.notes, a.type].filter(Boolean).join(' ').toLowerCase();
        if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  });

  /** All image attachments across all activities (unfiltered). */
  allImages = $derived<AirtableAttachment[]>(this.activities.flatMap((a) => a.images));

  /** Places that define the offline map area: every placed activity plus the itinerary's overnight stops. */
  mapPoints = $derived<Point[]>([
    ...this.activities.filter((a) => a.lat !== undefined && a.lng !== undefined).map((a) => ({ lat: a.lat!, lng: a.lng! })),
    ...this.days.filter((d) => d.lat !== undefined && d.lng !== undefined).map((d) => ({ lat: d.lat!, lng: d.lng! })),
  ]);
  mapPlan = $derived(planTiles(this.mapPoints));

  /** Active activities without a rating (priority). */
  unrated = $derived(this.activities.filter((a) => !a.priority && !this.isInactive(a)));
  ratingCurrentId = $derived(this.rating ? (this.rating.queue[this.rating.index] ?? null) : null);

  selectedActivity = $derived(this.activities.find((a) => a.id === this.selectedId) ?? null);

  activeFilterCount = $derived(
    FACETS.reduce((n, f) => n + this.selected[f.key].length, 0) + (this.search.trim() ? 1 : 0),
  );

  // ---- helpers -------------------------------------------------------------
  isInactive(a: Activity): boolean {
    return !!a.status && INACTIVE.test(a.status);
  }

  colorOf(a: Activity, key: FacetKey = this.colorBy): string {
    const v = facetValues(a, key)[0];
    if (!v) return NEUTRAL;
    return this.facets[key]?.find((o) => o.value === v)?.color ?? NEUTRAL;
  }


  toggleFacet(key: FacetKey, value: string) {
    const cur = this.selected[key];
    this.selected[key] = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  }

  clearFilters() {
    for (const { key } of FACETS) this.selected[key] = [];
    this.search = '';
  }

  toast(kind: Toast['kind'], message: string, action?: Toast['action'], ttl = 6000) {
    const id = Date.now() + Math.random();
    this.toasts = [...this.toasts, { id, kind, message, action }];
    if (ttl > 0) setTimeout(() => this.dismiss(id), ttl);
  }

  dismiss(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  persistUi() {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({ colorBy: this.colorBy, theme: this.theme, hideInactive: this.hideInactive, mapStyle: this.mapStyle }),
      );
    } catch {
      /* ignore */
    }
  }

  // ---- lifecycle -----------------------------------------------------------
  async init() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark = mq.matches;
    mq.addEventListener('change', (e) => (this.systemDark = e.matches));
    setInterval(() => (this.now = Date.now()), 30_000);
    window.addEventListener('hashchange', () => (this.mode = modeFromHash()));
    window.addEventListener('online', () => {
      this.online = true;
      void this.flushWrites();
    });
    window.addEventListener('offline', () => (this.online = false));

    const [server] = await Promise.all([loadServerConfig(), images.init()]);
    this.server = server;
    this.applyConfig(buildConfig(this.server, loadLocalSettings()));
    this.ready = true;
  }

  private applyConfig(cfg: AppConfig) {
    this.config = cfg;
    this.imagesExpired = false;
    if (!isConfigComplete(cfg)) {
      this.cache = null;
      this.showSettings = true;
      return;
    }
    this.mapping = loadMapping(cfg.baseId);
    this.itineraryMapping = loadMapping(cfg.baseId, 'itinerary');
    this.cache = loadCache(cfg.baseId);
    this.pending = loadPending(cfg.baseId);
    this.rating = null;
    const stale = !this.cache || Date.now() - this.cache.fetchedAt > MAX_AGE_MS;
    if (stale && this.online) void this.sync();
    else {
      void this.flushWrites();
      this.afterLoad();
      // Image links are only valid for ~2 h after a sync; fill gaps while they still work.
      if (this.cache && Date.now() - this.cache.fetchedAt < IMAGE_URL_TTL_MS) void this.cacheThumbnails();
    }
  }

  /** Persist auto-healed mapping, ask for help if something can't be resolved. */
  private afterLoad() {
    const r = this.resolved;
    if (!r) return;
    if (r.changed && this.config) {
      this.mapping = r.mapping;
      saveMapping(this.config.baseId, r.mapping);
    }
    const rd = this.resolvedDays;
    if (rd?.changed && rd.table && this.config) {
      this.itineraryMapping = rd.mapping;
      saveMapping(this.config.baseId, rd.mapping, 'itinerary');
    }
    if (!r.table || r.blocking) this.showMapping = true;
    if (r.table && this.cache && this.cache.tableId !== r.table.id && !this.syncing) void this.sync();
  }

  async sync() {
    const cfg = this.config;
    if (!cfg || !isConfigComplete(cfg) || this.syncing) return;
    this.syncing = true;
    try {
      const schema = await fetchSchema(cfg);
      const table = resolveTable(schema, TABLE_NAMES.activities, this.mapping.tableId);
      if (!table) {
        this.cache = { fetchedAt: Date.now(), schema, tableId: '', records: [] };
        this.showMapping = true;
        this.toast('error', `Table "${TABLE_NAMES.activities}" not found – pick the activities table in Field mapping.`);
        return;
      }
      await this.flushWrites();
      const records = await fetchAllRecords(cfg, table.id);
      // Keep local edits that could not be sent yet.
      for (const w of this.pending) {
        const rec = records.find((r) => r.id === w.recordId);
        if (rec) rec.fields[w.fieldId] = w.value;
      }
      const entry: CacheEntry = { fetchedAt: Date.now(), schema, tableId: table.id, records };
      // The itinerary table is optional – failures here must not break the activity sync.
      const dayTable = resolveTable(schema, TABLE_NAMES.itinerary, this.itineraryMapping.tableId);
      if (dayTable && dayTable.id !== table.id) {
        try {
          entry.itinerary = { tableId: dayTable.id, records: await fetchAllRecords(cfg, dayTable.id) };
        } catch (e) {
          this.toast('error', `Itinerary could not be loaded: ${e instanceof Error ? e.message : e}`);
        }
      }
      this.cache = entry;
      this.imagesExpired = false;
      if (!saveCache(cfg.baseId, entry)) this.toast('error', 'Could not store data in localStorage (quota?).');
      this.toast('success', `Synced ${records.length} records from Airtable.`, undefined, 2500);
      this.afterLoad();
      void this.cacheThumbnails();
    } catch (e) {
      this.toast('error', e instanceof Error ? e.message : String(e), { label: 'Settings', run: () => (this.showSettings = true) }, 10000);
    } finally {
      this.syncing = false;
    }
  }

  saveSettings(s: LocalSettings) {
    saveLocalSettings(s);
    this.selectedId = null;
    this.applyConfig(buildConfig(this.server, loadLocalSettings()));
    if (this.config && isConfigComplete(this.config)) void this.sync();
  }

  setMapping(m: StoredMapping) {
    if (!this.config) return;
    const tableChanged = m.tableId !== this.mapping.tableId;
    this.mapping = m;
    saveMapping(this.config.baseId, m);
    if (tableChanged || this.cache?.tableId !== m.tableId) void this.sync();
  }

  // ---- writes ---------------------------------------------------------------
  private persistCache() {
    if (this.cache && this.config) saveCache(this.config.baseId, $state.snapshot(this.cache) as CacheEntry);
  }

  private persistPending() {
    try {
      if (this.config) localStorage.setItem(pendingKey(this.config.baseId), JSON.stringify(this.pending));
    } catch {
      /* ignore */
    }
  }

  /** Set a field of an activity: updates the local cache immediately, then writes to Airtable (queued if offline). */
  setField(activityId: string, key: FieldKey, value: string | null) {
    const field = this.resolved?.fields[key];
    const rec = this.cache?.records.find((r) => r.id === activityId);
    if (!field || !rec) {
      this.toast('error', `Cannot save: column for "${key}" is not mapped.`);
      return;
    }
    if (value === null) delete rec.fields[field.id];
    else rec.fields[field.id] = value;
    this.persistCache();
    this.pending = [...this.pending.filter((w) => !(w.recordId === activityId && w.fieldId === field.id)), { recordId: activityId, fieldId: field.id, value }];
    this.persistPending();
    void this.flushWrites();
  }

  /** Send queued writes to Airtable one by one. Stops (keeps the queue) when offline. */
  async flushWrites() {
    const cfg = this.config;
    const tableId = this.cache?.tableId;
    if (this.flushing || !cfg || !tableId || !this.online || !this.pending.length) return;
    this.flushing = true;
    let rejected = false;
    try {
      while (this.pending.length) {
        const w = this.pending[0];
        try {
          const updated: AirtableRecord = await updateRecord(cfg, tableId, w.recordId, { [w.fieldId]: w.value });
          const rec = this.cache?.records.find((r) => r.id === w.recordId);
          if (rec) rec.fields = updated.fields;
          this.persistCache();
        } catch (e) {
          if (e instanceof AirtableError && e.status === undefined) break; // network → retry later
          this.toast('error', `Could not save to Airtable: ${e instanceof Error ? e.message : e}`, undefined, 10000);
          rejected = true;
        }
        this.pending = this.pending.slice(1);
        this.persistPending();
      }
    } finally {
      this.flushing = false;
    }
    // A rejected write leaves the local cache out of date → reload the truth from Airtable.
    if (rejected) void this.sync();
  }

  // ---- rating session -------------------------------------------------------
  startRating() {
    const queue = tour(this.unrated).map((a) => a.id);
    if (!queue.length) {
      this.toast('success', 'Every activity already has a rating.', undefined, 3000);
      return;
    }
    this.rating = { queue, index: 0, rated: 0 };
    this.selectedId = queue[0];
  }

  rate(value: string) {
    const id = this.ratingCurrentId;
    if (!id || !this.rating) return;
    this.setField(id, 'priority', value);
    this.rating.rated++;
    this.ratingStep(1);
  }

  /** Move forward/back in the queue (forward skips items rated meanwhile). */
  ratingStep(dir: 1 | -1) {
    const r = this.rating;
    if (!r) return;
    let i = r.index + dir;
    if (dir === 1) {
      while (i < r.queue.length && this.activities.find((a) => a.id === r.queue[i])?.priority) i++;
    }
    if (i < 0) i = 0;
    if (i >= r.queue.length) {
      const n = r.rated;
      this.rating = null;
      this.toast('success', `Done – ${n} activit${n === 1 ? 'y' : 'ies'} rated.`, undefined, 4000);
      return;
    }
    r.index = i;
    this.selectedId = r.queue[i];
  }

  stopRating() {
    this.rating = null;
  }

  /** Background job after each sync: drop images that no longer exist, store all large thumbnails. */
  async cacheThumbnails() {
    if (!this.cache) return;
    const all = this.allImages;
    if (!this.resolved?.blocking) await images.prune(new Set(all.map((a) => a.id)));
    await images.download(
      all.map((att) => ({ att, v: 'large' as const })),
      'Saving thumbnails',
      true,
    );
    void this.refreshStorage();
  }

  /** Store every image (thumbnails + originals) for offline use. Re-syncs first if image links have expired. */
  async downloadEverything() {
    if (!this.online) {
      this.toast('error', 'You are offline – connect to download images.');
      return;
    }
    if (!this.cache || Date.now() - this.cache.fetchedAt > IMAGE_URL_TTL_MS * 0.75) {
      await this.sync();
    }
    const all = this.allImages;
    const r = await images.download(
      [...all.map((att) => ({ att, v: 'large' as const })), ...all.map((att) => ({ att, v: 'full' as const }))],
      'Downloading images',
    );
    await offlineMap.persist();
    await this.refreshStorage();
    if (r.failed) this.toast('error', `${r.failed} image(s) could not be downloaded. Try again after a sync.`);
    else this.toast('success', 'All images are available offline.', undefined, 3000);
  }

  /** Pre-download the basemap for the area covered by the activities (and itinerary stops). */
  async downloadMap() {
    if (!this.online) {
      this.toast('error', 'You are offline – connect to download the map.');
      return;
    }
    if (!this.mapPoints.length) {
      this.toast('error', 'No activities with coordinates – nothing to download.');
      return;
    }
    try {
      const r = await offlineMap.download(this.mapPoints);
      await offlineMap.persist();
      await this.refreshStorage();
      if (!r) return;
      if (r.failed) this.toast('error', `${r.failed} map file(s) could not be downloaded. Try again later.`);
      else this.toast('success', 'The map of the activity area is available offline.', undefined, 3000);
    } catch (e) {
      this.toast('error', `Map download failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  async clearImages() {
    await images.clear();
    await this.refreshStorage();
  }

  async refreshStorage() {
    try {
      const e = await navigator.storage?.estimate?.();
      if (e) this.storage = { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    } catch {
      /* unsupported */
    }
  }

  /** Approximate size of the cached Airtable data in localStorage (UTF-16 → 2 bytes/char). */
  dataBytes(): number {
    try {
      const raw = this.config ? localStorage.getItem(`oreas:v1:data:${this.config.baseId}`) : null;
      return raw ? raw.length * 2 : 0;
    } catch {
      return 0;
    }
  }

  setItineraryMapping(m: StoredMapping<DayKey>) {
    if (!this.config) return;
    const tableChanged = m.tableId !== this.itineraryMapping.tableId;
    this.itineraryMapping = m;
    saveMapping(this.config.baseId, m, 'itinerary');
    if (tableChanged || this.cache?.itinerary?.tableId !== m.tableId) void this.sync();
  }

  /** Day number counted from the first dated day (gaps keep numbering honest). */
  dayNumber(d: Day): number {
    const first = this.days.find((x) => x.date)?.date;
    return d.date && first ? daysBetween(first, d.date) + 1 : this.days.indexOf(d) + 1;
  }

  /** Select a day (null = whole trip). Closes any open activity so the map can frame the day. */
  selectDay(dayId: string | null, scroll = false) {
    this.selectedId = null;
    this.activeDayId = dayId;
    // Scroll after the DOM has updated: selecting a day changes the card heights above it.
    if (dayId && scroll) void tick().then(() => scrollToDay(dayId));
  }

  /** Step to the previous/next day (from none: first/last day). */
  stepDay(dir: 1 | -1) {
    const days = this.days;
    if (!days.length) return;
    const i = days.findIndex((d) => d.id === this.activeDayId);
    const next = i < 0 ? (dir === 1 ? 0 : days.length - 1) : Math.max(0, Math.min(days.length - 1, i + dir));
    this.selectDay(days[next].id, true);
  }

  setMode(m: Mode) {
    this.mode = m;
    const hash = m === 'itinerary' ? '#itinerary' : '';
    if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname + location.search);
  }

  /** Jump from an activity to its day in the itinerary. */
  showDay(dayId: string) {
    this.setMode('itinerary');
    this.selectedId = null;
    this.activeDayId = dayId;
    // Wait for the itinerary to render before scrolling.
    setTimeout(() => scrollToDay(dayId), 50);
  }

  clearCache() {
    clearAllCaches();
    this.cache = null;
    void this.sync();
  }

  /** Called when an Airtable image fails to load (its signed URL probably expired). */
  reportImageError() {
    if (this.imagesExpired || !this.cache || !this.online) return;
    if (Date.now() - this.cache.fetchedAt > IMAGE_URL_TTL_MS) {
      this.imagesExpired = true;
      this.toast('info', 'Image links from Airtable expired.', { label: 'Refresh', run: () => void this.sync() }, 0);
    }
  }
}

export const app = new AppState();
