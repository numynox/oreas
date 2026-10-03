import { SvelteMap } from 'svelte/reactivity';
import type { AirtableAttachment } from './airtable/types';

/**
 * Offline image store.
 *
 * Airtable attachment URLs are signed and expire after ~2 h, but attachment IDs are stable.
 * We download images as blobs into IndexedDB keyed by `${attachmentId}:${variant}` and serve
 * them via object URLs, so images keep working offline and after the links expire.
 *
 * - `large` thumbnails (≤1280 px) are downloaded in the background after every sync.
 * - `full` originals are stored when first opened in the lightbox, or all at once via
 *   "Download everything for offline".
 */

export type Variant = 'large' | 'full';

interface StoredImage {
  key: string;
  blob: Blob;
  size: number;
  savedAt: number;
}

const DB_NAME = 'oreas-images';
const STORE = 'images';
const CONCURRENCY = 4;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const keyOf = (id: string, v: Variant) => `${id}:${v}`;

export function remoteUrl(att: AirtableAttachment, v: Variant): string {
  return v === 'large' ? (att.thumbnails?.large?.url ?? att.url) : att.url;
}

class ImageStore {
  /** Object URLs for blobs already loaded into memory, keyed by `${id}:${variant}`. */
  private urls = new SvelteMap<string, string>();
  /** Sizes of everything stored in IndexedDB (key → bytes). */
  sizes = new SvelteMap<string, number>();
  ready = $state(false);
  /** Progress of the current bulk download, if any. */
  progress = $state<{ done: number; total: number; failed: number; label: string } | null>(null);

  private inflight = new Map<string, Promise<string | undefined>>();
  private abort = false;

  bytes = $derived([...this.sizes.values()].reduce((a, b) => a + b, 0));

  count(v: Variant): number {
    let n = 0;
    for (const k of this.sizes.keys()) if (k.endsWith(`:${v}`)) n++;
    return n;
  }

  has(id: string, v: Variant): boolean {
    return this.sizes.has(keyOf(id, v));
  }

  async init() {
    if (this.ready || typeof indexedDB === 'undefined') return;
    try {
      // Load metadata for everything, and blobs for the (small) large thumbnails so they render instantly.
      const all = await tx<StoredImage[]>('readonly', (s) => s.getAll());
      for (const img of all) {
        this.sizes.set(img.key, img.size);
        if (img.key.endsWith(':large')) this.urls.set(img.key, URL.createObjectURL(img.blob));
      }
    } catch (e) {
      console.warn('Oreas: image store unavailable', e);
    }
    this.ready = true;
  }

  /**
   * Synchronous best URL: the stored copy if present, else the remote (signed) URL.
   * For `full`, falls back to the stored large thumbnail when nothing better is in memory.
   */
  url(att: AirtableAttachment, v: Variant = 'large'): string {
    return this.urls.get(keyOf(att.id, v)) ?? remoteUrl(att, v);
  }

  /** Stored-only URL (undefined if not stored / not loaded). */
  storedUrl(att: AirtableAttachment, v: Variant): string | undefined {
    return this.urls.get(keyOf(att.id, v));
  }

  /** Resolve a stored blob into an object URL (loads from IndexedDB on demand). */
  async load(att: AirtableAttachment, v: Variant): Promise<string | undefined> {
    const key = keyOf(att.id, v);
    const cached = this.urls.get(key);
    if (cached) return cached;
    if (!this.sizes.has(key)) return undefined;
    const img = await tx<StoredImage | undefined>('readonly', (s) => s.get(key));
    if (!img) return undefined;
    const u = URL.createObjectURL(img.blob);
    this.urls.set(key, u);
    return u;
  }

  /** Download and store one image variant (no-op if already stored). Returns its object URL. */
  fetch(att: AirtableAttachment, v: Variant): Promise<string | undefined> {
    const key = keyOf(att.id, v);
    if (this.sizes.has(key)) return this.load(att, v);
    const running = this.inflight.get(key);
    if (running) return running;
    const p = (async () => {
      try {
        const res = await fetch(remoteUrl(att, v), { mode: 'cors', credentials: 'omit' });
        if (!res.ok) return undefined;
        const blob = await res.blob();
        await tx('readwrite', (s) => s.put({ key, blob, size: blob.size, savedAt: Date.now() } satisfies StoredImage));
        this.sizes.set(key, blob.size);
        const u = URL.createObjectURL(blob);
        this.urls.set(key, u);
        return u;
      } catch {
        return undefined;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /** Download many variants with limited concurrency, reporting progress. */
  async download(items: { att: AirtableAttachment; v: Variant }[], label: string, silent = false) {
    const todo = items.filter(({ att, v }) => !this.has(att.id, v));
    if (!todo.length) return { done: 0, failed: 0 };
    if (this.progress) return { done: 0, failed: 0 }; // one bulk job at a time
    this.abort = false;
    const state = { done: 0, total: todo.length, failed: 0, label };
    if (!silent) this.progress = state;
    let i = 0;
    const worker = async () => {
      while (i < todo.length && !this.abort) {
        const { att, v } = todo[i++];
        const ok = await this.fetch(att, v);
        state.done++;
        if (!ok) state.failed++;
        if (!silent) this.progress = { ...state };
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    this.progress = null;
    return state;
  }

  cancel() {
    this.abort = true;
  }

  /** Remove stored images whose attachment no longer exists in the data. */
  async prune(validIds: Set<string>) {
    const stale = [...this.sizes.keys()].filter((k) => !validIds.has(k.split(':')[0]));
    for (const key of stale) {
      await tx('readwrite', (s) => s.delete(key)).catch(() => undefined);
      this.sizes.delete(key);
      const u = this.urls.get(key);
      if (u) URL.revokeObjectURL(u);
      this.urls.delete(key);
    }
  }

  async clear() {
    this.cancel();
    await tx('readwrite', (s) => s.clear()).catch(() => undefined);
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.sizes.clear();
  }
}

export const images = new ImageStore();

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
