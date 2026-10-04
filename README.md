# Oreas

A travel-planning map for activities stored in Airtable. Oreas shows every activity of a trip base on an interactive map, with filters, search, color coding, photos and a detail view, plus a day-by-day itinerary.

Everything it uses is free: [Svelte 5](https://svelte.dev), [Vite](https://vite.dev), [Tailwind CSS](https://tailwindcss.com), [MapLibre GL JS](https://maplibre.org), plus map data from [OpenFreeMap](https://openfreemap.org), hillshade from [AWS Terrain Tiles](https://registry.opendata.aws/raster-public-geospatial-data/) and [GEBCO](https://www.gebco.net), and other open data.

## Features

- **Map**: markers that you can color by type, status, region, priority or access. Nearby markers simply overlap (no clustering) and shrink when zoomed out. Hover a marker for a preview with a photo.
- **Map styles**: Streets (follows the light/dark theme), Minimal, **Terrain** (hillshade and 3D relief from AWS Terrain Tiles; starts flat, tilt with right-drag or a two-finger drag), Topographic, Satellite, Railway (OSM Railway overlay) and More.
- **Filters and search**: filter chips for type, status, region, priority and access (public transport / car). Search covers name, location and notes. Skipped and deprecated activities are hidden by default.
- **Rate mode**: the **Rate** button walks through every active activity without a rating (in a geographic tour), zooms to it and shows its details with the choices Low, Medium, High and Must have. Ratings are saved to Airtable.
- **Itinerary**: switch between **Explore** and **Itinerary** at the top of the panel (bookmarkable as `#itinerary`). The itinerary lists the trip day by day from the `Itinerary` table: date, day title, overnight city and accommodation, travel legs between days, and linked activities (from the activity table). The cost shown includes activity costs + travel + accommodation for each day.
- **Details**: an image carousel with a fullscreen lightbox, duration, cost, booking flag, notes, the website and a Google Maps link.
- **Unplaced activities**: records without Latitude/Longitude still appear in the list with an "Unplaced" badge.
- **Offline-friendly cache**: data is stored in `localStorage`. It syncs automatically when the cache is more than 24 h old, or when you press sync.
- **Offline images**: after each sync, the large thumbnail of every image is saved to IndexedDB in the background. Full-size images are saved when you first open them in the fullscreen viewer, or when you download them in Settings.
- **Offline app and map**: a service worker (production build only) caches the app itself, so Oreas starts without a connection. Every map area you look at is cached as you go. **Settings → Download map** lets you select and download a region in advance.
- **Installable**: a web app manifest lets you add Oreas to the home screen or install it as an app (Chrome, Edge, Safari, Firefox on Android). Downloads ask the browser to make storage persistent.
- **Robust to column renames**: columns are referenced by Airtable field ID, so renaming a column changes nothing. If a column is deleted, Oreas asks you to pick a replacement in **Settings → Field mapping**.
- Light and dark themes, plus a mobile bottom-sheet layout.

## Airtable token

Create a [personal access token](https://airtable.com/create/tokens) with:

- scopes `data.records:read`, `schema.bases:read` and `data.records:write` (only needed for ratings)
- access limited to your trip base

The base needs a table (default `Activities`) with at least a name column and `Latitude`/`Longitude` number columns. All other columns are optional and can be mapped in the app.

The optional `Itinerary` table has one row per day: `Date` (required), `Day Title`, `Overnight city`, `Accommodation`, `Travel`, `Activities` (links to the activity table), `Notes`, and `Overnight location coordinates` (for travel routing).

## Deployment options

The API key is never shipped in the JavaScript bundle.

| | Where the key lives | How the browser reaches Airtable |
|---|---|---|
| Local dev | `.env` (git-ignored) | Vite dev proxy `/api/airtable` adds the key on the server |
| Raspberry Pi (Docker) | Stack environment / `.env` | nginx proxy `/api/airtable` (GET + single-record PATCH) adds the key on the server |
| GitHub Pages | Entered in **Settings** and kept in that browser's `localStorage` | Directly to `api.airtable.com` |

In proxy mode the server provides a public `/config.json` containing the base ID and table name, but never the key. If that file is missing, as on GitHub Pages, the app switches to direct mode.

### 1. Local

```bash
cp .env.example .env   # then fill in AIRTABLE_API_KEY and AIRTABLE_BASE_ID
npm install
npm run dev            # http://localhost:5173
```

### 2. Raspberry Pi with Docker Compose / Dockhand

`docker-compose.yml` builds the image on the Pi itself. It is a multi-stage build that uses Node to build the app and nginx to serve it, and it works on arm64.

**Dockhand ("stack from Git")**: point the stack at this repository and the `docker-compose.yml` at its root. Then set these stack environment variables:

```
AIRTABLE_API_KEY=pat_...your_token...
AIRTABLE_BASE_ID=app...your_base_id...
AIRTABLE_TABLE=Activities            # optional
OREAS_PORT=8080                      # optional host port
```

**Plain Docker Compose**:

```bash
cp .env.example .env   # fill in the key and base ID
docker compose up -d --build
```

The app is served at `http://<pi>:8080`. The proxy accepts only `GET` requests plus `PATCH` of a single record (ratings), and the key exists only in the container's nginx config, never in the web bundle.

### 3. GitHub Pages

The workflow `.github/workflows/pages.yml` builds and deploys the app. It is currently manual-only (**Actions → Deploy to GitHub Pages → Run workflow**); add a `push` trigger to deploy on every push.

## Development

```bash
npm run check   # svelte-check / TypeScript
npm run build   # static build into dist/
```

Project layout:

```
src/
  App.svelte                 layout (desktop panels / mobile sheet)
  lib/state.svelte.ts        app state (Svelte 5 runes): data, filters, sync, cache
  lib/airtable/
    config.ts                proxy vs direct mode, local settings
    client.ts                Airtable REST + Meta API (records keyed by field ID)
    fields.ts                rename-safe field mapping
    activities.ts            record → Activity conversion, formatting
    itinerary.ts             record → Day conversion, stays, date helpers
    cache.ts                 localStorage cache (24 h)
  lib/images.svelte.ts       offline image store (IndexedDB blobs → object URLs)
  lib/offlineMap.svelte.ts   offline map: tile plan for the activity area, bulk download, storage persistence
  service-worker.js          service worker template (app shell + map tile caching), built into dist/sw.js
  lib/mapStyles.ts           basemap catalog (vector styles, raster maps, hillshade/rail overlays)
  lib/basemap.ts             style/overlay helpers for the map
  lib/components/            Map, filters, list, detail drawer, settings, mapping, lightbox…
public/                      favicon, app icons, web app manifest
docker/                      nginx proxy template + runtime config.json script
```

Note: Airtable image links expire after about 2 h. Stored images are keyed by their stable attachment ID, so they keep working. If an image that was never stored fails to load in an older cache, the app shows a placeholder and suggests re-syncing.
