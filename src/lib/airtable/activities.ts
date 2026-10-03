import type { FieldKey, ResolvedMapping } from './fields';
import type { AirtableAttachment, AirtableField, AirtableRecord } from './types';

export interface Activity {
  id: string;
  name: string;
  location?: string;
  region?: string;
  priority?: string;
  access?: string;
  type?: string;
  status?: string;
  durationSec?: number;
  cost?: number;
  booking: boolean;
  url?: string;
  notes?: string;
  images: AirtableAttachment[];
  lat?: number;
  lng?: number;
}

function first(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

function asString(v: unknown): string | undefined {
  v = first(v);
  if (v == null) return undefined;
  if (typeof v === 'object' && 'name' in (v as object)) return String((v as { name: unknown }).name);
  const s = String(v).trim();
  return s ? s : undefined;
}

function asStrings(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => asString(x)).filter((x): x is string => !!x);
}

function asNumber(v: unknown): number | undefined {
  v = first(v);
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function toActivity(rec: AirtableRecord, r: ResolvedMapping): Activity {
  const get = (k: FieldKey): unknown => {
    const f = r.fields[k];
    return f ? rec.fields[f.id] : undefined;
  };
  const lat = asNumber(get('lat'));
  const lng = asNumber(get('lng'));
  const validCoords =
    lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const attachments = (get('attachments') as AirtableAttachment[] | undefined) ?? [];
  return {
    id: rec.id,
    name: asString(get('name')) ?? '(unnamed)',
    location: asString(get('location')),
    region: asString(get('region')),
    priority: asString(get('priority')),
    access: asString(get('access')),
    type: asString(get('type')),
    status: asString(get('status')),
    durationSec: asNumber(get('duration')),
    cost: asNumber(get('cost')),
    booking: !!first(get('booking')),
    url: asString(get('url')),
    notes: asString(get('notes')),
    images: Array.isArray(attachments) ? attachments.filter((a) => a?.type?.startsWith('image/')) : [],
    lat: validCoords ? lat : undefined,
    lng: validCoords ? lng : undefined,
  };
}

/** Select choices (in Airtable order) with their colors, if the field is a select. */
export function choicesOf(f?: AirtableField): { name: string; color?: string }[] {
  if (!f) return [];
  return f.options?.choices ?? f.options?.result?.options?.choices ?? [];
}

export function formatDuration(sec?: number): string | undefined {
  if (sec == null) return undefined;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function formatCost(value: number | undefined, f?: AirtableField): string | undefined {
  if (value == null) return undefined;
  if (value === 0) return 'Free';
  const symbol = f?.options?.symbol ?? '';
  const precision = f?.options?.precision ?? 0;
  const n = value.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision });
  return `${symbol}${n}`;
}
