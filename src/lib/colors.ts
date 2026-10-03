/** Airtable select colors → vivid marker colors (we use the "Bright" tone of each hue). */
const HUES: Record<string, string> = {
  blue: '#2d7ff9',
  cyan: '#18bfff',
  teal: '#20c9c2',
  green: '#20c933',
  yellow: '#fcb400',
  orange: '#ff6f2c',
  red: '#f82b60',
  pink: '#ff08c2',
  purple: '#8b46ff',
  gray: '#7c8594',
};

/** Fallback palette for fields without Airtable colors (text fields) or with colliding colors. */
export const PALETTE = [
  '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9', '#d946ef',
  '#84cc16', '#f97316', '#14b8a6', '#8b5cf6', '#ef4444', '#06b6d4',
  '#eab308', '#ec4899', '#22c55e', '#3b82f6',
];

export const NEUTRAL = '#94a3b8';

export function airtableColor(name?: string): string | undefined {
  if (!name) return undefined;
  const hue = name.match(/^[a-z]+/)?.[0];
  return hue ? HUES[hue] : undefined;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Build a value → color map. Uses Airtable choice colors if they are distinct;
 * otherwise (missing or duplicate colors) assigns a distinct palette color per value.
 */
export function buildColorMap(values: string[], choiceColors?: Map<string, string | undefined>): Map<string, string> {
  const out = new Map<string, string>();
  if (choiceColors && choiceColors.size) {
    const mapped = values.map((v) => airtableColor(choiceColors.get(v)));
    const distinct = new Set(mapped.filter(Boolean));
    if (mapped.every(Boolean) && distinct.size === mapped.length) {
      values.forEach((v, i) => out.set(v, mapped[i]!));
      return out;
    }
  }
  const used = new Set<number>();
  values.forEach((v, i) => {
    let idx = values.length <= PALETTE.length ? i : hash(v) % PALETTE.length;
    if (values.length <= PALETTE.length) {
      while (used.has(idx)) idx = (idx + 1) % PALETTE.length;
      used.add(idx);
    }
    out.set(v, PALETTE[idx]);
  });
  return out;
}
