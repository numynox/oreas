import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

/** Writes are only allowed as PATCH of a single record (used for ratings). */
const RECORD_PATCH = /^\/api\/airtable\/v0\/app[A-Za-z0-9]+\/[A-Za-z0-9]+\/rec[A-Za-z0-9]+(\?.*)?$/;

/**
 * Dev-only plugin: serves /config.json (proxy mode, no key) and limits the Airtable
 * proxy to reads plus single-record PATCH.
 */
function oreasDevServer(env: Record<string, string>): Plugin {
  return {
    name: 'oreas-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        const allowed = req.method === 'GET' || req.method === 'HEAD' || (req.method === 'PATCH' && RECORD_PATCH.test(url));
        if (url.startsWith('/api/airtable') && !allowed) {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        if (url === '/config.json' || url.startsWith('/config.json?')) {
          if (!env.AIRTABLE_API_KEY) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            JSON.stringify({
              mode: 'proxy',
              baseId: env.AIRTABLE_BASE_ID ?? '',
              table: env.AIRTABLE_TABLE ?? 'Activities',
            }),
          );
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load all env vars (no VITE_ prefix) – used server-side only, never exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    build: { chunkSizeWarningLimit: 1600 }, // maplibre-gl alone is ~800 kB
    worker: { format: 'es' },
    plugins: [tailwindcss(), svelte(), oreasDevServer(env)],
    server: {
      proxy: env.AIRTABLE_API_KEY
        ? {
            '/api/airtable': {
              target: 'https://api.airtable.com',
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/api\/airtable/, ''),
              headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
            },
          }
        : undefined,
    },
  };
});
