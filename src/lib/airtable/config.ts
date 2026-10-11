/**
 * Runtime configuration.
 *
 * - proxy mode: a server (Vite dev server or nginx) serves /config.json and proxies
 *   /api/airtable/* to Airtable, injecting the API key server-side. The browser never sees the key.
 * - direct mode: no /config.json (e.g. GitHub Pages), or keys entered in Settings. The keys are
 *   stored in this browser's localStorage only and sent directly to api.airtable.com.
 *
 * Direct mode takes up to two tokens: a write token (ratings, creating columns) and a read-only token
 * (also the one a share link hands out). Either one is enough; without a write token Oreas is read-only.
 */
export type Mode = 'proxy' | 'direct';

export interface ServerConfig {
  mode: 'proxy';
  baseId: string;
}

export interface LocalSettings {
  baseId?: string;
  /** Token with write scopes. */
  writeKey?: string;
  /** Token with read scopes only. */
  readKey?: string;
  /** Single token of older versions (treated as the write token). */
  apiKey?: string;
}

/** Tables are not configured here: both are found by default name, then remembered by ID (see Field mapping). */
export interface AppConfig {
  mode: Mode;
  baseId: string;
  /** Token for reads (direct mode). */
  readKey?: string;
  /** Token for writes (direct mode). */
  writeKey?: string;
  /** False when only a read-only token is configured: ratings and creating columns are disabled. */
  canWrite: boolean;
}

const SETTINGS_KEY = 'oreas:v1:settings';

export async function loadServerConfig(): Promise<ServerConfig | null> {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<ServerConfig>;
    if (data?.mode !== 'proxy') return null;
    return { mode: 'proxy', baseId: data.baseId ?? '' };
  } catch {
    // Missing file or SPA fallback returning HTML → direct mode.
    return null;
  }
}

export function loadLocalSettings(): LocalSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as LocalSettings;
    if (s.apiKey && !s.writeKey) s.writeKey = s.apiKey;
    delete s.apiKey;
    return s;
  } catch {
    return {};
  }
}

export function saveLocalSettings(s: LocalSettings): void {
  try {
    const clean: LocalSettings = {};
    if (s.baseId?.trim()) clean.baseId = s.baseId.trim();
    if (s.writeKey?.trim()) clean.writeKey = s.writeKey.trim();
    if (s.readKey?.trim()) clean.readKey = s.readKey.trim();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    /* storage unavailable */
  }
}

/** Tokens entered in this browser take precedence over the server proxy (e.g. a read-only share link). */
export function buildConfig(server: ServerConfig | null, local: LocalSettings): AppConfig {
  const baseId = local.baseId || server?.baseId || '';
  if (server && !local.writeKey && !local.readKey) return { mode: 'proxy', baseId, canWrite: true };
  return {
    mode: 'direct',
    baseId,
    readKey: local.readKey || local.writeKey,
    writeKey: local.writeKey,
    canWrite: !!local.writeKey,
  };
}

export function isConfigComplete(cfg: AppConfig): boolean {
  if (!/^app[A-Za-z0-9]{14}$/.test(cfg.baseId)) return false;
  if (cfg.mode === 'direct' && !cfg.readKey) return false;
  return true;
}
