import type { AppConfig } from './config';
import type { AirtableField, AirtableRecord, AirtableSchema, AirtableTable } from './types';

export class AirtableError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

function apiRoot(cfg: AppConfig): string {
  return cfg.mode === 'proxy' ? './api/airtable' : 'https://api.airtable.com';
}

function explain(status: number, body: string): string {
  switch (status) {
    case 401:
      return 'Airtable rejected the API key (401). Check the token in Settings / .env.';
    case 403:
      return 'Access denied (403). The token needs the scopes data.records:read, schema.bases:read, data.records:write (ratings) and schema.bases:write (creating tables/columns), and access to this base.';
    case 404:
      return 'Base or table not found (404). Check the base ID and table in Settings.';
    case 405:
      return 'Method not allowed by the proxy.';
    case 422:
      return `Airtable could not process the request (422): ${body.slice(0, 200)}`;
    case 429:
      return 'Airtable rate limit hit (429). Try again in a moment.';
    default:
      return `Airtable request failed (${status}).`;
  }
}

async function request<T>(cfg: AppConfig, path: string, init: { method?: string; body?: unknown } = {}, attempt = 0): Promise<T> {
  const headers: Record<string, string> = {};
  if (cfg.mode === 'direct' && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${apiRoot(cfg)}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AirtableError('Network error – are you offline?');
  }
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return request<T>(cfg, path, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AirtableError(explain(res.status, body), res.status);
  }
  return (await res.json()) as T;
}

const get = <T>(cfg: AppConfig, path: string) => request<T>(cfg, path);

export function fetchSchema(cfg: AppConfig): Promise<AirtableSchema> {
  return get<AirtableSchema>(cfg, `/v0/meta/bases/${encodeURIComponent(cfg.baseId)}/tables`);
}

export async function fetchAllRecords(cfg: AppConfig, tableId: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
    if (offset) params.set('offset', offset);
    const page = await get<{ records: AirtableRecord[]; offset?: string }>(
      cfg,
      `/v0/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(tableId)}?${params}`,
    );
    records.push(...page.records);
    offset = page.offset;
  } while (offset);
  return records;
}

/**
 * Update fields of one record. Fields are keyed by field ID.
 * This is the only write operation in Oreas (used for ratings).
 */
export function updateRecord(
  cfg: AppConfig,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  return request<AirtableRecord>(
    cfg,
    `/v0/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`,
    { method: 'PATCH', body: { fields, returnFieldsByFieldId: true, typecast: true } },
  );
}

/** Field definition for the Meta API (create table / create field). */
export interface FieldSpec {
  name: string;
  type: string;
  description?: string;
  options?: Record<string, unknown>;
}

/** Create a table with the given fields (the first field becomes the primary field). Needs `schema.bases:write`. */
export function createTable(cfg: AppConfig, name: string, fields: FieldSpec[], description?: string): Promise<AirtableTable> {
  return request<AirtableTable>(cfg, `/v0/meta/bases/${encodeURIComponent(cfg.baseId)}/tables`, {
    method: 'POST',
    body: { name, description, fields },
  });
}

/** Add a field to an existing table. Needs `schema.bases:write`. */
export function createField(cfg: AppConfig, tableId: string, field: FieldSpec): Promise<AirtableField> {
  return request<AirtableField>(cfg, `/v0/meta/bases/${encodeURIComponent(cfg.baseId)}/tables/${encodeURIComponent(tableId)}/fields`, {
    method: 'POST',
    body: field,
  });
}
