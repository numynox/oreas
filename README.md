# Oreas

A travel-planning map for activities stored in Airtable. Oreas shows every activity of a trip base on an interactive map, with filters, search, color coding, photos and a detail view, plus a day-by-day itinerary. It reads from Airtable; the only write is the rating (Priority) you set in **Rate** mode.

Everything it uses is free: [Svelte 5](https://svelte.dev), [Vite](https://vite.dev), [Tailwind CSS](https://tailwindcss.com), [MapLibre GL JS](https://maplibre.org), plus map data from [OpenFreeMap](https://openfreemap.org), [OpenTopoMap](https://opentopomap.org), [OpenRailwayMap](https://www.openrailwaymap.org), [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) and [GSI Japan](https://maps.gsi.go.jp/development/ichiran.html). No map API key is needed.

## Features

- **Map**: markers that you can color by type, status, region, priority or access. Nearby markers simply overlap (no clustering) and shrink when zoomed out. Hover a marker for a preview with a photo. Click it to fly there and see a photo bubble.
- **Map styles**: Streets (follows the light/dark theme), Minimal, **Terrain** (hillshade and 3D relief from AWS Terrain Tiles; starts flat, tilt with right-drag or a two-finger drag), Topographic (OpenTopoMap), **Railways** (OpenRailwayMap overlay with every train line), Aerial photos and the official GSI Japan map. All are free and need no key.
- **Filters and search**: filter chips for type, status, region, priority and access (public transport / car). Search covers name, location and notes. Skipped and deprecated activities are hidden by default.
- **Rate mode**: the **Rate** button walks through every active activity without a rating (in a geographic tour), zooms to it and shows its details with the choices Low, Medium, High and Must have (keys 1–4, ← → to go back or skip, Esc to stop). Ratings are written to the Priority column right away. Offline ratings are queued and sent when you're back online.
- **Itinerary**: switch between **Explore** and **Itinerary** at the top of the panel (bookmarkable as `#itinerary`). The itinerary lists the trip day by day from the `Itinerary` table: date, day title, travel note, linked activities (with photos), notes, overnight city and accommodation. Both views share the same map (no reload when switching); the sidebar widens for the itinerary. In the itinerary the map shows the overnight stops joined in travel order and highlights the current day's activities, following the day you scroll to. Activities link back and forth: the explorer shows "Day N" badges, and the detail view lists the days an activity is planned on.
- **Details**: an image carousel with a fullscreen lightbox, duration, cost, booking flag, notes, the website and a Google Maps link.
- **Unplaced activities**: records without Latitude/Longitude still appear in the list with an "Unplaced" badge.
- **Offline-friendly cache**: data is stored in `localStorage`. It syncs automatically when the cache is more than 24 h old, or when you press sync.
- **Offline images**: after each sync, the large thumbnail of every image is saved to IndexedDB in the background. Full-size images are saved when you first open them in the fullscreen viewer, or all at once with **Settings → Download everything for offline**. Settings also shows the online status and storage use. Map tiles and the app shell are not yet offline (see [OPEN-POINTS.md](OPEN-POINTS.md)).
- **Robust to column renames**: columns are referenced by Airtable field ID, so renaming a column changes nothing. If a column is deleted, Oreas asks you to pick a replacement in **Settings → Field mapping**.
- Light and dark themes, plus a mobile bottom-sheet layout.

## Airtable token

Create a [personal access token](https://airtable.com/create/tokens) with:

- scopes `data.records:read`, `schema.bases:read` and `data.records:write` (only needed for ratings)
- access limited to your trip base, for example **Japan 2027** (`appYOMAihqLlbtMdd`)

The base needs a table (default `Activities`) with at least a name column and `Latitude`/`Longitude` number columns. All other columns are optional and can be mapped in the app.

The optional `Itinerary` table has one row per day: `Date` (required), `Day Title`, `Overnight city`, `Accommodation`, `Travel`, `Activities` (links to the activity table), `Notes`, and `Overnight Latitude`/`Overnight Longitude` (used to draw the trip on the map). Columns are mapped by field ID too (**Settings → Field mapping → Itinerary**).

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
cp .env.example .env   # then fill in AIRTABLE_API_KEY
npm install
npm run dev            # http://localhost:5173
```

### 2. Raspberry Pi with Docker Compose / Dockhand

`docker-compose.yml` builds the image on the Pi itself. It is a multi-stage build that uses Node to build the app and nginx to serve it, and it works on arm64.

**Dockhand ("stack from Git")**: point the stack at this repository and the `docker-compose.yml` at its root. Then set these stack environment variables:

```
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=appYOMAihqLlbtMdd   # optional, this is the default
AIRTABLE_TABLE=Activities            # optional
OREAS_PORT=8080                      # optional host port
```

**Plain Docker Compose**:

```bash
cp .env.example .env   # fill in the key
docker compose up -d --build
```

The app is served at `http://<pi>:8080`. The proxy accepts only `GET` requests plus `PATCH` of a single record (ratings), and the key exists only in the container's nginx config, never in the web root.

### 3. GitHub Pages

The workflow `.github/workflows/pages.yml` builds and deploys on every push to `main`. One-time setup: go to **Settings → Pages → Source** and choose **GitHub Actions**. No secrets are involved. Open the page, enter the base ID and token in Settings, and they are saved in your browser only.

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
  lib/mapStyles.ts           basemap catalog (vector styles, raster maps, hillshade/rail overlays)
  lib/basemap.ts             style/overlay helpers for the map
  lib/components/            Map, filters, list, detail drawer, settings, mapping, lightbox…
docker/                      nginx proxy template + runtime config.json script
```

Note: Airtable image links expire after about 2 h. Stored images are keyed by their stable attachment ID, so they keep working. If an image that was never stored fails to load in an older cache, Oreas offers a **Refresh** that runs a sync.
