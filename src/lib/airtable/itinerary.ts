import type { DayKey, ResolvedMapping } from './fields';
import type { AirtableRecord } from './types';

export interface Day {
  id: string;
  /** ISO date `YYYY-MM-DD` (undefined if not set). */
  date?: string;
  title?: string;
  city?: string;
  accommodation?: string;
  /** Short travel label, e.g. "Kanazawa -> Himeji -> Hiroshima". */
  travel?: string;
  /** Long travel description (connections, durations), shown in a popup. */
  travelDetails?: string;
  notes?: string;
  /** Photography highlights for the day (spots, best light/timing). */
  photoSpots?: string;
  /** Linked activity record IDs, in Airtable order. */
  activityIds: string[];
  lat?: number;
  lng?: number;
}

function str(v: unknown): string | undefined {
  if (Array.isArray(v)) v = v[0];
  if (v == null) return undefined;
  if (typeof v === 'object' && 'name' in (v as object)) return String((v as { name: unknown }).name);
  const s = String(v).trim();
  return s || undefined;
}

function num(v: unknown): number | undefined {
  if (Array.isArray(v)) v = v[0];
  const n = typeof v === 'number' ? v : v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function toDay(rec: AirtableRecord, r: ResolvedMapping<DayKey>): Day {
  const get = (k: DayKey): unknown => {
    const f = r.fields[k];
    return f ? rec.fields[f.id] : undefined;
  };
  const links = get('activities');
  const lat = num(get('lat'));
  const lng = num(get('lng'));
  const ok = lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    id: rec.id,
    date: str(get('date'))?.slice(0, 10),
    title: str(get('title')),
    city: str(get('city')),
    accommodation: str(get('accommodation')),
    travel: str(get('travel')),
    travelDetails: str(get('travelDetails')),
    notes: str(get('notes')),
    photoSpots: str(get('photoSpots')),
    activityIds: Array.isArray(links) ? links.map((l) => (typeof l === 'string' ? l : (l as { id: string }).id)) : [],
    lat: ok ? lat : undefined,
    lng: ok ? lng : undefined,
  };
}

/** A day is "empty" if nothing but the record exists (e.g. a blank row). */
export function isEmptyDay(d: Day): boolean {
  return !d.date && !d.title && !d.city && !d.travel && !d.travelDetails && !d.notes && !d.photoSpots && !d.activityIds.length;
}

/** Scroll the itinerary list (the day's scroll container) so the day card is at the top. */
export function scrollToDay(dayId: string, smooth = true) {
  const el = document.querySelector<HTMLElement>(`[data-day="${dayId}"]`);
  const scroller = el?.closest<HTMLElement>('.overflow-y-auto');
  if (!el || !scroller) return;
  const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
  scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

/** Parse `YYYY-MM-DD` as a local calendar date (no timezone shift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDay(iso?: string): { weekday: string; date: string } | undefined {
  if (!iso) return undefined;
  const d = parseDate(iso);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  };
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** Consecutive nights in the same place. */
export interface Stay {
  key: string;
  city: string;
  accommodation?: string;
  nights: number;
  firstDayId: string;
  dayIds: string[];
  from?: string;
  to?: string;
  lat?: number;
  lng?: number;
}

/** Group consecutive days by overnight place (city name, else coordinates). Days without a place are skipped. */
export function stays(days: Day[]): Stay[] {
  const out: Stay[] = [];
  for (const d of days) {
    const place = d.city ?? (d.lat !== undefined ? `${d.lat.toFixed(3)},${d.lng!.toFixed(3)}` : undefined);
    if (!place) continue;
    const last = out[out.length - 1];
    if (last && last.key === place && last.dayIds.length === last.nights) {
      last.nights++;
      last.dayIds.push(d.id);
      last.to = d.date ?? last.to;
      last.lat ??= d.lat;
      last.lng ??= d.lng;
      last.accommodation ??= d.accommodation;
    } else {
      out.push({
        key: place,
        city: d.city ?? 'Overnight stop',
        accommodation: d.accommodation,
        nights: 1,
        firstDayId: d.id,
        dayIds: [d.id],
        from: d.date,
        to: d.date,
        lat: d.lat,
        lng: d.lng,
      });
    }
  }
  return out;
}
