import type { LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Basemap catalog. Everything here is free and needs no API key:
 * - OpenFreeMap vector styles (OSM data)
 * - OpenTopoMap raster (topographic, contour lines + hillshade)
 * - AWS Open Data terrain tiles (Terrarium DEM) for hillshading / 3D terrain
 * - OpenRailwayMap raster overlay (railway lines)
 * - GSI Japan (国土地理院) aerial photos and standard map (Japan only)
 */

export type StyleId = 'streets' | 'light' | 'terrain' | 'topo' | 'rail' | 'satellite' | 'gsi';

export interface Overlay {
  id: string;
  source: SourceSpecification;
  layer: LayerSpecification;
  /** Insert below the base style's first label layer (keeps place names readable). */
  belowLabels?: boolean;
}

export interface MapStyleDef {
  id: StyleId;
  label: string;
  description: string;
  /** CSS background for the picker swatch. */
  swatch: (dark: boolean) => string;
  /** Style URL or inline style; `dark` is the current UI theme. */
  style: (dark: boolean) => string | StyleSpecification;
  overlays?: (dark: boolean) => Overlay[];
  /** Whether the basemap is dark (for label/halo colors of our own layers). */
  isDark: (dark: boolean) => boolean;
  /** Enable 3D terrain (visible when the map is tilted). */
  terrain3d?: boolean;
}

const OFM = 'https://tiles.openfreemap.org/styles';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const DEM: SourceSpecification = {
  type: 'raster-dem',
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles (AWS, Mapzen)</a>',
};

function rasterStyle(tiles: string[], attribution: string, maxzoom = 18, tileSize = 256): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { base: { type: 'raster', tiles, tileSize, maxzoom, attribution } },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

const hillshade = (dark: boolean): Overlay => ({
  id: 'hillshade',
  source: DEM,
  belowLabels: true,
  layer: {
    id: 'hillshade',
    type: 'hillshade',
    source: 'hillshade',
    paint: {
      'hillshade-exaggeration': dark ? 0.45 : 0.55,
      'hillshade-shadow-color': dark ? '#000000' : '#3d3226',
      'hillshade-highlight-color': dark ? '#5b6170' : '#ffffff',
      'hillshade-accent-color': dark ? '#111111' : '#5a4a36',
    },
  },
});

const railways = (dark: boolean): Overlay => ({
  id: 'railways',
  source: {
    type: 'raster',
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png`),
    tileSize: 256,
    maxzoom: 19,
    attribution:
      'Railways: <a href="https://www.openrailwaymap.org/" target="_blank">OpenRailwayMap</a> (CC-BY-SA)',
  },
  layer: {
    id: 'railways',
    type: 'raster',
    source: 'railways',
    paint: { 'raster-opacity': dark ? 0.85 : 0.95, 'raster-brightness-min': dark ? 0.15 : 0 },
  },
});

export const MAP_STYLES: MapStyleDef[] = [
  {
    id: 'streets',
    label: 'Streets',
    description: 'Colorful street map, follows light/dark theme',
    swatch: (d) => (d ? 'linear-gradient(135deg,#1f2937,#374151 60%,#4b5563)' : 'linear-gradient(135deg,#f2efe9,#cfe5c9 55%,#a9d3f0)'),
    style: (d) => `${OFM}/${d ? 'dark' : 'liberty'}`,
    isDark: (d) => d,
  },
  {
    id: 'light',
    label: 'Minimal',
    description: 'Calm, low-contrast map that lets markers stand out',
    swatch: (d) => (d ? 'linear-gradient(135deg,#2b3a4a,#3d5266)' : 'linear-gradient(135deg,#fafafa,#e5e7eb 60%,#d4dde6)'),
    style: (d) => `${OFM}/${d ? 'fiord' : 'positron'}`,
    isDark: (d) => d,
  },
  {
    id: 'terrain',
    label: 'Terrain',
    description: 'Hillshaded relief with 3D mountains (tilt: right-drag or two fingers)',
    swatch: () => 'linear-gradient(135deg,#e8dfcf,#b9a98a 45%,#7d8f6a 70%,#e9f0e2)',
    style: (d) => `${OFM}/${d ? 'dark' : 'liberty'}`,
    overlays: (d) => [hillshade(d)],
    isDark: (d) => d,
    terrain3d: true,
  },
  {
    id: 'topo',
    label: 'Topographic',
    description: 'Hiking map with contour lines and trails (OpenTopoMap)',
    swatch: () => 'linear-gradient(135deg,#f3eedc,#d6c79f 40%,#9cbf8a 70%,#7fb0d6)',
    style: () =>
      rasterStyle(
        ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        'Map: <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA), © OpenStreetMap contributors',
        17,
      ),
    isDark: () => false,
  },
  {
    id: 'rail',
    label: 'Railways',
    description: 'All train lines incl. Shinkansen on a calm base map',
    swatch: (d) =>
      d
        ? 'linear-gradient(135deg,#1f2937 0 45%,#f97316 45% 50%,#1f2937 50% 70%,#2563eb 70% 74%,#1f2937 74%)'
        : 'linear-gradient(135deg,#f5f5f4 0 45%,#f97316 45% 50%,#f5f5f4 50% 70%,#2563eb 70% 74%,#f5f5f4 74%)',
    style: (d) => `${OFM}/${d ? 'dark' : 'positron'}`,
    overlays: (d) => [railways(d)],
    isDark: (d) => d,
  },
  {
    id: 'satellite',
    label: 'Aerial (Japan)',
    description: 'Aerial photos from GSI Japan – detailed in Japan only',
    swatch: () => 'linear-gradient(135deg,#2f4a2a,#566b3c 40%,#8a8a6a 65%,#2b4c6b)',
    style: () =>
      rasterStyle(
        ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'],
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル (GSI Japan)</a>',
        18,
      ),
    isDark: () => true,
  },
  {
    id: 'gsi',
    label: 'GSI Japan',
    description: 'Official Japanese map: railways, stations and Japanese names',
    swatch: () => 'linear-gradient(135deg,#ffffff,#e8f1e1 50%,#c9dcef 75%,#9a9a9a)',
    style: () =>
      rasterStyle(
        ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
        '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル (GSI Japan)</a>',
        18,
      ),
    isDark: () => false,
  },
];

export function getStyle(id: string | undefined): MapStyleDef {
  return MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0];
}

export const DEM_SOURCE = DEM;
