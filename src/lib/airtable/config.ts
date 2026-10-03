/**
 * Runtime configuration.
 *
 * - proxy mode: a server (Vite dev server or nginx) serves /config.json and proxies
 *   /api/airtable/* to Airtable, injecting the API key server-side. The browser never sees the key.
 * - direct mode: no /config.json (e.g. GitHub Pages). The user enters the key in Settings;
 *   it is stored in this browser's localStorage only and sent directly to api.airtable.com.
 */
export type Mode = 'proxy' | 'direct';

export interface ServerConfig {
  mode: 'proxy';
  baseId: string;
  table: string;
}

export interface LocalSettings {
  baseId?: string;
  table?: string;
  apiKey?: string;
}

export interface AppConfig {
  mode: Mode;
  baseId: string;
  table: string;
  apiKey?: string;
}

const SETTINGS_KEY = 'oreas:v1:settings';

export async function loadServerConfig(): Promise<ServerConfig | null> {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ServerConfig>;
    if (data?.mode !== 'proxy') return null;
    return { mode: 'proxy', baseId: data.baseId ?? '', table: data.table || 'Activities' };
  } catch {
    // Missing file or SPA fallback returning HTML → direct mode.
    return null;
  }
}

export function loadLocalSettings(): LocalSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as LocalSettings;
  } catch {
    return {};
  }
}

export function saveLocalSettings(s: LocalSettings): void {
  try {
    const clean: LocalSettings = {};
    if (s.baseId?.trim()) clean.baseId = s.baseId.trim();
    if (s.table?.trim()) clean.table = s.table.trim();
    if (s.apiKey?.trim()) clean.apiKey = s.apiKey.trim();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    /* storage unavailable */
  }
}

export function buildConfig(server: ServerConfig | null, local: LocalSettings): AppConfig {
  if (server) {
    return {
      mode: 'proxy',
      baseId: local.baseId || server.baseId,
      table: local.table || server.table,
    };
  }
  return {
    mode: 'direct',
    baseId: local.baseId ?? '',
    table: local.table || 'Activities',
    apiKey: local.apiKey,
  };
}

export function isConfigComplete(cfg: AppConfig): boolean {
  if (!/^app[A-Za-z0-9]{14}$/.test(cfg.baseId)) return false;
  if (cfg.mode === 'direct' && !cfg.apiKey) return false;
  return true;
}
