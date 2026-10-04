import type { AirtableField, AirtableSchema, AirtableTable } from './types';

/**
 * Rename-safe column mapping.
 *
 * Every logical field the app uses is mapped to an Airtable field *ID*. Field IDs never change
 * when a column is renamed. If a stored ID disappears (column deleted / re-created), we fall back
 * to the default column name, and if that fails the field is reported as unresolved so the user
 * can pick a replacement column in the Field Mapping dialog.
 */

export type FieldKey =
  | 'name'
  | 'lat'
  | 'lng'
  | 'location'
  | 'region'
  | 'priority'
  | 'access'
  | 'type'
  | 'status'
  | 'duration'
  | 'cost'
  | 'booking'
  | 'url'
  | 'notes'
  | 'attachments';

/** Logical fields of the (optional) itinerary table. */
export type DayKey =
  | 'date'
  | 'title'
  | 'city'
  | 'travel'
  | 'travelDetails'
  | 'activities'
  | 'notes'
  | 'photoSpots'
  | 'accommodation'
  | 'lat'
  | 'lng';

export type MappingKind = 'activities' | 'itinerary';

/**
 * Default table names, used only to find each table the first time. After that the table is
 * remembered by its ID (rename-safe) and can be switched per table in the Field mapping dialog.
 */
export const TABLE_NAMES: Record<MappingKind, string> = { activities: 'Activities', itinerary: 'Itinerary' };

export interface FieldDef<K extends string = FieldKey> {
  key: K;
  label: string;
  defaultName: string;
  required: boolean;
  /** Compatible Airtable field types (formula/rollup/lookup are accepted if their result type matches). */
  types: string[];
  hint?: string;
}

const TEXT = ['singleLineText', 'multilineText', 'richText', 'email', 'phoneNumber'];
const CATEGORY = ['singleSelect', 'singleLineText'];

export const FIELD_DEFS: FieldDef<FieldKey>[] = [
  { key: 'name', label: 'Name', defaultName: 'Name', required: true, types: [...TEXT, 'autoNumber'] },
  { key: 'lat', label: 'Latitude', defaultName: 'Latitude', required: true, types: ['number'], hint: 'WGS84 decimal degrees' },
  { key: 'lng', label: 'Longitude', defaultName: 'Longitude', required: true, types: ['number'], hint: 'WGS84 decimal degrees' },
  { key: 'location', label: 'Location / address', defaultName: 'Location', required: false, types: TEXT },
  { key: 'region', label: 'Region', defaultName: 'Region', required: false, types: [...TEXT, 'singleSelect'] },
  { key: 'type', label: 'Activity type', defaultName: 'Activity type', required: false, types: CATEGORY },
  { key: 'status', label: 'Status', defaultName: 'Status', required: false, types: CATEGORY },
  { key: 'priority', label: 'Priority / rating', defaultName: 'Priority', required: false, types: ['singleSelect'] },
  { key: 'access', label: 'Access by', defaultName: 'Access by', required: false, types: CATEGORY },
  { key: 'duration', label: 'Est. duration', defaultName: 'Est. Duration', required: false, types: ['duration', 'number'] },
  { key: 'cost', label: 'Est. cost', defaultName: 'Est. Cost (per person)', required: false, types: ['currency', 'number'] },
  { key: 'booking', label: 'Booking required', defaultName: 'Booking Required', required: false, types: ['checkbox'] },
  { key: 'url', label: 'Website / link', defaultName: 'Website / Booking Link', required: false, types: ['url', 'singleLineText'] },
  { key: 'notes', label: 'Notes', defaultName: 'Notes', required: false, types: ['multilineText', 'richText', 'singleLineText'] },
  { key: 'attachments', label: 'Images', defaultName: 'Attachments', required: false, types: ['multipleAttachments'] },
];

export const DAY_FIELD_DEFS: FieldDef<DayKey>[] = [
  { key: 'date', label: 'Date', defaultName: 'Date', required: true, types: ['date', 'dateTime'] },
  { key: 'title', label: 'Day title', defaultName: 'Day Title', required: false, types: TEXT },
  { key: 'city', label: 'Overnight city', defaultName: 'Overnight city', required: false, types: [...TEXT, 'singleSelect'] },
  { key: 'accommodation', label: 'Accommodation', defaultName: 'Accommodation', required: false, types: TEXT },
  { key: 'travel', label: 'Travel (short label)', defaultName: 'Travel', required: false, types: TEXT },
  { key: 'travelDetails', label: 'Travel details', defaultName: 'Travel details', required: false, types: TEXT },
  { key: 'activities', label: 'Activities (links)', defaultName: 'Activities', required: false, types: ['multipleRecordLinks'] },
  { key: 'notes', label: 'Notes', defaultName: 'Notes', required: false, types: ['multilineText', 'richText', 'singleLineText'] },
  { key: 'photoSpots', label: 'Photo spots', defaultName: 'Photo spots', required: false, types: ['multilineText', 'richText', 'singleLineText'] },
  { key: 'lat', label: 'Overnight latitude', defaultName: 'Overnight Latitude', required: false, types: ['number'] },
  { key: 'lng', label: 'Overnight longitude', defaultName: 'Overnight Longitude', required: false, types: ['number'] },
];

export const DEFS = { activities: FIELD_DEFS, itinerary: DAY_FIELD_DEFS } as const;

/** Stored per base and kind. A field value of `null` means "intentionally not mapped". */
export interface StoredMapping<K extends string = FieldKey> {
  tableId?: string;
  fields: Partial<Record<K, string | null>>;
}

/** Known IDs for the Japan 2027 base so it works without any name matching. */
const ITINERARY_SEEDS: Record<string, StoredMapping<DayKey>> = {
  appYOMAihqLlbtMdd: {
    tableId: 'tbl8PxPKUNNTsu4d0',
    fields: {
      date: 'fldJfNxbkwRIT5diP',
      title: 'fldF5ZGnmh4xGxj2A',
      city: 'fldMDHzbZxDxlNnuc',
      travel: 'fldL3S5EAIbKKQPGr',
      travelDetails: 'fld2AmxdTYeTzPpaO',
      activities: 'fldBBFp4HzLqzpbJG',
      notes: 'fldj0MjMOE3YqfUIt',
      photoSpots: 'fldmAffjIRdZzafQ9',
      accommodation: 'fldT54hTNmgUJm9th',
      lat: 'fld4Up4If3PuQhMBC',
      lng: 'fldP59286PozlQoJQ',
    },
  },
};

const SEEDS: Record<string, StoredMapping> = {
  appYOMAihqLlbtMdd: {
    tableId: 'tblo6mSOFhn6XETRK',
    fields: {
      name: 'fldV8kT69gNTziLkm',
      lat: 'fldosMFPeTn88opoq',
      lng: 'fldAlxRgYmEzAAMna',
      location: 'fldvAd8mhDoLXOgtx',
      region: 'fld972HNzbYUAs8sW',
      priority: 'fldBRtE71EMTMSA8Z',
      access: 'fldDiRzXHiGbtwTn6',
      type: 'fldwgoayet85PHZT0',
      status: 'fld04tOIKDdAyTpou',
      duration: 'fldFQ7moSYOFR0JXG',
      cost: 'fldWzsu84kozs3pj4',
      booking: 'fldlFECFbMe8M05eR',
      url: 'fldANn6IhEi8gNL0H',
      notes: 'fldeOtJEhZkCjqsQG',
      attachments: 'fld4PkFe0RekCrMr8',
    },
  },
};

const mappingKey = (baseId: string, kind: MappingKind) =>
  kind === 'activities' ? `oreas:v1:mapping:${baseId}` : `oreas:v1:mapping:${baseId}:${kind}`;

export function loadMapping(baseId: string): StoredMapping<FieldKey>;
export function loadMapping(baseId: string, kind: 'itinerary'): StoredMapping<DayKey>;
export function loadMapping(baseId: string, kind: MappingKind = 'activities'): StoredMapping<string> {
  try {
    const raw = localStorage.getItem(mappingKey(baseId, kind));
    if (raw) return JSON.parse(raw) as StoredMapping<string>;
  } catch {
    /* ignore */
  }
  const seed = (kind === 'activities' ? SEEDS : ITINERARY_SEEDS)[baseId];
  return seed ? structuredClone(seed) : { fields: {} };
}

export function saveMapping(baseId: string, mapping: StoredMapping<string>, kind: MappingKind = 'activities'): void {
  try {
    localStorage.setItem(mappingKey(baseId, kind), JSON.stringify(mapping));
  } catch {
    /* ignore */
  }
}

/** Effective type of a field, unwrapping formula/rollup/lookup results. */
export function effectiveType(f: AirtableField): string {
  if (['formula', 'rollup', 'multipleLookupValues'].includes(f.type) && f.options?.result?.type) {
    return f.options.result.type;
  }
  return f.type;
}

export function isCompatible(def: FieldDef<string>, f: AirtableField): boolean {
  return def.types.includes(effectiveType(f));
}

export function compatibleFields(def: FieldDef<string>, table: AirtableTable): AirtableField[] {
  return table.fields.filter((f) => isCompatible(def, f));
}

export interface ResolvedMapping<K extends string = FieldKey> {
  table: AirtableTable | null;
  fields: Partial<Record<K, AirtableField>>;
  /** Fields that could not be found and were not intentionally unmapped. */
  unresolved: FieldDef<K>[];
  /** True if a required field (or the table) is unresolved – the app cannot render. */
  blocking: boolean;
  /** The mapping with any auto-healed IDs (persist if `changed`). */
  mapping: StoredMapping<K>;
  changed: boolean;
}

export function resolveTable(schema: AirtableSchema, tableSetting: string, storedId?: string): AirtableTable | null {
  const byId = (id?: string) => (id ? schema.tables.find((t) => t.id === id) : undefined);
  const wanted = tableSetting.trim().toLowerCase();
  return (
    byId(storedId) ??
    byId(tableSetting.trim()) ??
    schema.tables.find((t) => t.name.toLowerCase() === wanted) ??
    null
  );
}

export function resolveMapping<K extends string = FieldKey>(
  schema: AirtableSchema,
  tableSetting: string,
  stored: StoredMapping<K>,
  defs: FieldDef<K>[] = FIELD_DEFS as unknown as FieldDef<K>[],
): ResolvedMapping<K> {
  const mapping: StoredMapping<K> = { tableId: stored.tableId, fields: { ...stored.fields } };
  let changed = false;
  const table = resolveTable(schema, tableSetting, stored.tableId);
  if (!table) {
    return { table: null, fields: {}, unresolved: [], blocking: true, mapping, changed };
  }
  if (mapping.tableId !== table.id) {
    // Different table than the stored mapping was made for: start fresh.
    if (mapping.tableId) mapping.fields = {};
    mapping.tableId = table.id;
    changed = true;
  }

  const fields: Partial<Record<K, AirtableField>> = {};
  const unresolved: FieldDef<K>[] = [];
  for (const def of defs) {
    const storedId = mapping.fields[def.key];
    if (storedId === null && !def.required) continue; // intentionally unmapped
    const byId = storedId ? table.fields.find((f) => f.id === storedId && isCompatible(def, f)) : undefined;
    if (byId) {
      fields[def.key] = byId;
      continue;
    }
    const byName = table.fields.find(
      (f) => f.name.trim().toLowerCase() === def.defaultName.toLowerCase() && isCompatible(def, f),
    );
    if (byName) {
      fields[def.key] = byName;
      mapping.fields[def.key] = byName.id;
      changed = true;
      continue;
    }
    unresolved.push(def);
  }
  const blocking = unresolved.some((d) => d.required);
  return { table, fields, unresolved, blocking, mapping, changed };
}
