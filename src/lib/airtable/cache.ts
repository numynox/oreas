import type { AirtableRecord, AirtableSchema } from './types';

export interface CacheEntry {
  fetchedAt: number;
  schema: AirtableSchema;
  tableId: string;
  records: AirtableRecord[];
  /** Optional itinerary table (day-by-day plan). */
  itinerary?: { tableId: string; records: AirtableRecord[] };
}

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Airtable attachment URLs expire after ~2 hours. */
export const IMAGE_URL_TTL_MS = 2 * 60 * 60 * 1000;

const key = (baseId: string) => `oreas:v1:data:${baseId}`;

export function loadCache(baseId: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(key(baseId));
    return raw ? (JSON.parse(raw) as CacheEntry) : null;
  } catch {
    return null;
  }
}

export function saveCache(baseId: string, entry: CacheEntry): boolean {
  try {
    localStorage.setItem(key(baseId), JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

export function clearAllCaches(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('oreas:v1:data:')) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
