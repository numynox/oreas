export interface AirtableChoice {
  id: string;
  name: string;
  color?: string;
}

export interface AirtableField {
  id: string;
  name: string;
  type: string;
  description?: string;
  options?: {
    choices?: AirtableChoice[];
    symbol?: string;
    precision?: number;
    durationFormat?: string;
    result?: { type: string; options?: AirtableField['options'] };
    [key: string]: unknown;
  };
}

export interface AirtableTable {
  id: string;
  name: string;
  primaryFieldId: string;
  description?: string;
  fields: AirtableField[];
}

export interface AirtableSchema {
  tables: AirtableTable[];
}

export interface AirtableRecord {
  id: string;
  createdTime: string;
  /** Keyed by field ID (we always request returnFieldsByFieldId=true). */
  fields: Record<string, unknown>;
}

export interface AirtableThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  type: string;
  size?: number;
  width?: number;
  height?: number;
  thumbnails?: {
    small?: AirtableThumbnail;
    large?: AirtableThumbnail;
    full?: AirtableThumbnail;
  };
}
