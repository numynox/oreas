import * as maplibregl from 'maplibre-gl';
// MapLibre v6 ships its worker as a separate ES module; let Vite bundle it (with its shared chunk)
// and hand MapLibre the resulting URL. Works in dev and in the static build.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };
