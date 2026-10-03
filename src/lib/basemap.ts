import type { Map as MlMap } from 'maplibre-gl';
import { DEM_SOURCE, type MapStyleDef } from './mapStyles';

/** Changes only when the actual basemap changes (theme-independent styles don't reload on theme switch). */
export function styleKey(def: MapStyleDef, dark: boolean): string {
  const st = def.style(dark);
  return `${def.id}|${typeof st === 'string' ? st : 'inline'}|${def.overlays ? dark : ''}`;
}

/** Add hillshade / railway overlays and 3D terrain for a style (call on every `style.load`). */
export function addOverlays(map: MlMap, def: MapStyleDef, dark: boolean) {
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
