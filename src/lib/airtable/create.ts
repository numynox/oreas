import { createField, createTable, type FieldSpec } from './client';
import type { AppConfig } from './config';
import { BUDGET_TABLE, DEFS, TABLE_NAMES, type FieldDef, type MappingKind } from './fields';
import type { AirtableSchema } from './types';

/**
 * "Create missing tables and columns": builds a plan from the field-mapping drafts and executes it
 * with the Airtable Meta API (token scope `schema.bases:write`).
 *
 * Draft values: a field ID, `''` (= missing → create it) or `NONE` (= intentionally not used).
 * A table draft of `''` means the table is missing and is created with all its columns.
 */
export const NONE = '__none__';

export interface Draft {
  tableId: string;
  fields: Record<string, string>;
}
export type Drafts = Record<MappingKind, Draft>;

const KINDS: MappingKind[] = ['activities', 'itinerary']; // activities first: the itinerary links to it

const text = { type: 'singleLineText' };
const long = { type: 'multilineText' };
const coord = { type: 'number', options: { precision: 6 } };
// The API cannot create rollups, so a missing cost column becomes a plain currency column.
const cost = { type: 'currency', options: { precision: 2, symbol: '€' } };
const budget = { type: 'multipleRecordLinks', description: `Items of the ${BUDGET_TABLE} table` };
const select = (...names: string[]) => ({ type: 'singleSelect', options: { choices: names.map((name) => ({ name })) } });

/** Column type used when Oreas creates a column (`linkedTableId` is filled in at execution time). */
const SPECS: Record<MappingKind, Record<string, Omit<FieldSpec, 'name'>>> = {
  activities: {
    name: text,
    lat: { ...coord, description: 'WGS84 decimal degrees' },
    lng: { ...coord, description: 'WGS84 decimal degrees' },
    location: text,
    region: text,
    type: select('City', 'Hike', 'Food', 'Museum', 'Onsen'),
    status: select('Idea', 'Shortlisted', 'Booked', 'Skipped'),
    priority: select('Low', 'Medium', 'High', 'Must have'),
    access: select('Public transport', 'Car preferred', 'Car only'),
    duration: { type: 'duration', options: { durationFormat: 'h:mm' } },
    cost,
    budget,
    booking: { type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
    url: { type: 'url' },
    notes: long,
    attachments: { type: 'multipleAttachments' },
  },
  itinerary: {
    date: { type: 'date', options: { dateFormat: { name: 'iso' } } },
    title: text,
    city: text,
    accommodation: text,
    travel: text,
    travelDetails: long,
    activities: { type: 'multipleRecordLinks' },
    notes: long,
    photoSpots: long,
    cost,
    budget,
    lat: { ...coord, description: 'Overnight stop, WGS84 decimal degrees' },
    lng: { ...coord, description: 'Overnight stop, WGS84 decimal degrees' },
  },
};

export interface Plan {
  tables: MappingKind[];
  fields: { kind: MappingKind; def: FieldDef<string> }[];
}

/** Budget link columns can only be created when the base has a Budget table to link to. */
const budgetTable = (schema?: AirtableSchema) => schema?.tables.find((t) => t.name.toLowerCase() === BUDGET_TABLE.toLowerCase());

/** Whether Oreas can create this column (used to leave it out of the plan). */
function creatable(def: FieldDef<string>, schema?: AirtableSchema): boolean {
  return def.key !== 'budget' || !!budgetTable(schema);
}

export function plan(drafts: Drafts, schema?: AirtableSchema): Plan {
  const p: Plan = { tables: [], fields: [] };
  for (const kind of KINDS) {
    const d = drafts[kind];
    if (d.tableId === NONE) continue;
    if (!d.tableId) {
      p.tables.push(kind);
      continue;
    }
    for (const def of DEFS[kind] as FieldDef<string>[]) if (!d.fields[def.key] && creatable(def, schema)) p.fields.push({ kind, def });
  }
  return p;
}

export function describe(p: Plan): string[] {
  const out = p.tables.map((k) => `New table "${TABLE_NAMES[k]}"`);
  for (const kind of KINDS) {
    const names = p.fields.filter((f) => f.kind === kind).map((f) => f.def.defaultName);
    if (names.length) out.push(`${kind === 'activities' ? 'Activities' : 'Itinerary'} table: ${names.join(', ')}`);
  }
  return out;
}

/** Pick a name that does not clash (Airtable names are unique, case-insensitive). */
function freeName(wanted: string, taken: string[]): string {
  const lower = new Set(taken.map((n) => n.toLowerCase()));
  if (!lower.has(wanted.toLowerCase())) return wanted;
  for (let i = 2; ; i++) {
    const n = `${wanted} (${i})`;
    if (!lower.has(n.toLowerCase())) return n;
  }
}

/** Execute the plan. Returns updated drafts with the IDs of everything that was created. */
export async function execute(cfg: AppConfig, schema: AirtableSchema, drafts: Drafts, p: Plan): Promise<Drafts> {
  const out: Drafts = structuredClone(drafts);
  const tableNames = schema.tables.map((t) => t.name);

  const budgetId = budgetTable(schema)?.id;
  const spec = (kind: MappingKind, def: FieldDef<string>, name: string): FieldSpec => {
    const s = { name, ...SPECS[kind][def.key] } as FieldSpec;
    if (s.type === 'multipleRecordLinks') s.options = { linkedTableId: def.key === 'budget' ? budgetId : out.activities.tableId };
    return s;
  };

  for (const kind of KINDS) {
    const defs = DEFS[kind] as FieldDef<string>[];
    if (p.tables.includes(kind)) {
      // The first column becomes the primary field (Name / Date).
      const fields = defs.filter((d) => creatable(d, schema)).map((d) => spec(kind, d, d.defaultName));
      const name = freeName(TABLE_NAMES[kind], tableNames);
      const t = await createTable(cfg, name, fields, kind === 'activities' ? 'Places and activities (created by Oreas)' : 'Day-by-day plan (created by Oreas)');
      tableNames.push(name);
      out[kind].tableId = t.id;
      for (const d of defs) out[kind].fields[d.key] = t.fields.find((f) => f.name === d.defaultName)?.id ?? '';
      continue;
    }
    const table = schema.tables.find((t) => t.id === out[kind].tableId);
    if (!table) continue;
    const taken = table.fields.map((f) => f.name);
    for (const { def } of p.fields.filter((f) => f.kind === kind)) {
      const name = freeName(def.defaultName, taken);
      const f = await createField(cfg, table.id, spec(kind, def, name));
      taken.push(name);
      out[kind].fields[def.key] = f.id;
    }
  }
  return out;
}
