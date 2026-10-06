import type { Map as MlMap } from 'maplibre-gl';
import { DEM_SOURCE, type MapStyleDef } from './mapStyles';

/** Changes only when the actual basemap changes (theme-independent styles don't reload on theme switch). */
export function styleKey(def: MapStyleDef, dark: boolean): string {
  const st = def.style(dark);
  return `${def.id}|${typeof st === 'string' ? st : 'inline'}|${def.overlays ? dark : ''}`;
}

const MISSING_LOW: Record<string, number> = { '<': 1e9, '<=': 1e9, '>': -1e9, '>=': -1e9 };

/**
 * Numeric comparisons on a missing property (e.g. OpenFreeMap's `["<=", ["get", "ref_length"], 6]`)
 * evaluate against null and MapLibre warns on every tile load. Coalesce the property to a value
 * that makes the comparison false, which is what MapLibre falls back to anyway.
 */
function guardNullComparisons(expr: unknown): unknown {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr;
  const fallback = typeof op === 'string' ? MISSING_LOW[op] : undefined;
  return [
    op,
    ...args.map((a) =>
      fallback !== undefined && Array.isArray(a) && a[0] === 'get' ? ['coalesce', a, fallback] : guardNullComparisons(a),
    ),
  ];
}

function patchFilters(map: MlMap) {
  for (const layer of map.getStyle().layers) {
    if (!('filter' in layer) || !layer.filter) continue;
    const json = JSON.stringify(layer.filter);
    if (!json.includes('["get"')) continue;
    const patched = guardNullComparisons(layer.filter);
    if (JSON.stringify(patched) !== json) map.setFilter(layer.id, patched as typeof layer.filter);
  }
}

/** Add hillshade / railway overlays and 3D terrain for a style (call on every `style.load`). */
export function addOverlays(map: MlMap, def: MapStyleDef, dark: boolean) {
  patchFilters(map);
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  for (const o of def.overlays?.(dark) ?? []) {
    map.addSource(o.id, o.source);
    map.addLayer(o.layer, o.belowLabels ? firstLabel : undefined);
  }
  if (def.terrain3d) {
    map.addSource('terrain-dem', DEM_SOURCE);
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.4 });
  } else {
    map.setTerrain(null);
  }
}
