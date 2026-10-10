// Test fixture: a complete mock Airtable base for Oreas (see README.md in this folder).
import { readFileSync } from 'node:fs';

const dir = new URL('.', import.meta.url);

/** Local calendar date as `YYYY-MM-DD`. */
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The fixture with its `{{today±N}}` date tokens resolved against `today` (default: now), so the
 * trip is always under way: it starts 4 days ago, today is day 5.
 */
export function loadFixture(today = new Date()) {
  const raw = readFileSync(new URL('airtable-base.json', dir), 'utf8').replace(/\{\{today([+-]\d+)?\}\}/g, (_, n) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(n ?? 0));
    return isoDate(d);
  });
  return JSON.parse(raw);
}

/** Image served for every attachment URL (https://dl.airtable.test/…). */
export const photo = readFileSync(new URL('photo.jpg', dir));

/**
 * Serve the fixture to the app in a Playwright browser context: Airtable API (schema + both tables),
 * attachment images, and the app settings (base ID + a dummy token) so it syncs on load.
 */
export async function installAirtableMock(context, fixture = loadFixture()) {
  await context.route(/api\.airtable\.com/, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/meta/bases/')) return route.fulfill({ json: fixture.schema });
    const table = Object.keys(fixture.records).find((id) => path.endsWith(`/${id}`));
    if (table && route.request().method() === 'GET') return route.fulfill({ json: { records: fixture.records[table] } });
    if (table) return route.fulfill({ json: {} });
    // Single-record PATCH (ratings): echo an empty success.
    if (route.request().method() === 'PATCH') return route.fulfill({ json: { id: path.split('/').pop(), fields: {} } });
    return route.fulfill({ status: 404, json: { error: 'NOT_FOUND' } });
  });
  await context.route(/dl\.airtable\.test/, (route) =>
    route.fulfill({ body: photo, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' } }),
  );
  await context.addInitScript((baseId) => {
    if (!localStorage.getItem('oreas:v1:settings')) localStorage.setItem('oreas:v1:settings', JSON.stringify({ baseId, apiKey: 'patTEST' }));
  }, fixture.baseId);
  return fixture;
}
