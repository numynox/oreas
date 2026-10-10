<script lang="ts">
  import { maplibregl, transformRequest } from '../maplibre';
  import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { app } from '../state.svelte';
  import type { Activity } from '../airtable/activities';
  import { images } from '../images.svelte';
  import { getStyle } from '../mapStyles';
  import { addOverlays as addStyleOverlays, styleKey as keyOf } from '../basemap';
  import { stays } from '../airtable/itinerary';

  /**
   * One map for both modes (never re-created when switching):
   * - explore: all filtered activities ("points")
   * - itinerary: trip line through overnight stops, stops, and scheduled activities ("trip-*")
   * Layers of the inactive mode are hidden via visibility.
   */

  interface Props {
    /** Extra padding (px) so fitted bounds are not hidden behind floating panels. */
    padding: { top: number; right: number; bottom: number; left: number };
  }
  let { padding }: Props = $props();

  const styleDef = $derived(getStyle(app.mapStyle));
  /** Changes only when the actual basemap changes (theme-independent styles don't reload on theme switch). */
  const styleKey = $derived(keyOf(styleDef, app.dark));
  const SRC = 'activities';
  const POINT_LAYERS = ['points', 'trip-acts'];
  const EXPLORE_LAYERS = ['points', 'point-labels'];
  const TRIP_LAYERS = ['path-casing', 'path', 'trip-acts', 'trip-acts-label', 'stops', 'stops-label'];
  const JAPAN: [number, number, number, number] = [128.5, 30.5, 146, 45.8];

  let container: HTMLDivElement;
  let map: maplibregl.Map | undefined;
  let styleReady = $state(false);
  let hoverPopup: maplibregl.Popup | undefined;
  let bubble: maplibregl.Marker | undefined;
  let lastFitKey = '';

  const placed = $derived(app.filtered.filter((a) => a.lat !== undefined && a.lng !== undefined));

  function collection(list: Activity[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
    return {
      type: 'FeatureCollection',
      features: list.map((a) => ({
        type: 'Feature',
        id: a.id,
        geometry: { type: 'Point', coordinates: [a.lng!, a.lat!] },
        properties: { id: a.id, name: a.name, color: app.colorOf(a) },
      })),
    };
  }
  const geojson = $derived(collection(placed));

  // ---- itinerary data ----
  const byId = $derived(new Map(app.activities.map((a) => [a.id, a])));
  const tripStays = $derived(stays(app.days).filter((s) => s.lat !== undefined));
  const pathData = $derived<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features:
      tripStays.length > 1
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: tripStays.map((s) => [s.lng!, s.lat!]) } }]
        : [],
  });
  /** Per stay: its activities (all nights) counted by "color by" color, largest slice first. */
  const stayPies = $derived(
    tripStays.map((s) => {
      const counts = new Map<string, number>();
      for (const d of app.days) {
        if (!s.dayIds.includes(d.id)) continue;
        for (const id of d.activityIds) {
          const a = byId.get(id);
          if (a) counts.set(app.colorOf(a), (counts.get(app.colorOf(a)) ?? 0) + 1);
        }
      }
      const slices = [...counts].sort((x, y) => y[1] - x[1]);
      return { id: `pie-${slices.map(([c, n]) => `${c}:${n}`).join(',')}`, slices };
    }),
  );
  const stopData = $derived<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: tripStays.map((s, i) => ({
      type: 'Feature',
      properties: {
        label: `${s.city} · ${s.nights} night${s.nights > 1 ? 's' : ''}`,
        day: s.firstDayId,
        stay: i,
        active: app.activeDayId && s.dayIds.includes(app.activeDayId) ? 1 : 0,
        pie: stayPies[i].id,
      },
      geometry: { type: 'Point', coordinates: [s.lng!, s.lat!] },
    })),
  });
  /** Scheduled activities; the active day's ones are emphasised (and drawn last, on top). */
  const tripActs = $derived.by<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const d of app.days) {
      for (const id of d.activityIds) {
        const a = byId.get(id);
        if (!a || a.lat === undefined) continue;
        features.push({
          type: 'Feature',
          properties: { id: a.id, name: a.name, color: app.colorOf(a), active: d.id === app.activeDayId || app.activeStayDayIds?.includes(d.id) ? 1 : 0, hover: app.hoveredId === a.id ? 1 : 0 },
          geometry: { type: 'Point', coordinates: [a.lng!, a.lat!] },
        });
      }
    }
    features.sort((x, y) => x.properties!.active - y.properties!.active);
    return { type: 'FeatureCollection', features };
  });

  function esc(s: string) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }

  function popupHtml(a: Activity) {
    const img = a.images[0] ? images.url(a.images[0]) : undefined;
    const meta = [a.type, a.region].filter(Boolean).map((s) => esc(s!)).join(' · ');
    return `<div style="width:220px">
      ${img ? `<div style="height:120px;background:#cbd5e1 url('${encodeURI(img)}') center/cover"></div>` : ''}
      <div style="padding:10px 12px">
        <div style="font-weight:650;font-size:14px;line-height:1.25">${esc(a.name)}</div>
        ${meta ? `<div style="font-size:12px;opacity:.65;margin-top:2px">${meta}</div>` : ''}
      </div></div>`;
  }

  /** Stop icon size (css px) when its day is selected; unselected stops are scaled down via icon-size. */
  const PIE_SIZE = 36;
  const PIE_SMALL = 0.62;

  /** Draw a stop as a pie of activity counts with a violet ring (white disc when the stay has no activities). */
  function pieImage(slices: [string, number][]): ImageData {
    const ratio = 2;
    const px = PIE_SIZE * ratio;
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.canvas.width = ctx.canvas.height = px;
    const c = px / 2;
    const ring = 3 * ratio;
    const r = c - ring / 2 - ratio;
    const total = slices.reduce((n, [, k]) => n + k, 0);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    let start = -Math.PI / 2;
    for (const [color, n] of slices) {
      const end = start + (n / total) * Math.PI * 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, start, end);
      ctx.closePath();
      ctx.fill();
      if (slices.length > 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = ratio;
        ctx.stroke();
      }
      start = end;
    }
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = ring;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
    return ctx.getImageData(0, 0, px, px);
  }

  /** Register missing pie images (images are keyed by content, and dropped by MapLibre on style switch). */
  function ensurePies() {
    if (!map) return;
    for (const p of untrack(() => stayPies)) {
      if (!map.hasImage(p.id)) map.addImage(p.id, pieImage(p.slices), { pixelRatio: 2 });
    }
  }

  type Expr = maplibregl.ExpressionSpecification;
  const SELECTED: Expr = ['boolean', ['feature-state', 'selected'], false];
  const HOVER: Expr = ['boolean', ['feature-state', 'hover'], false];
  /** Radius by zoom: small dots when zoomed out (many overlaps), bigger when zoomed in. */
  function radius(): Expr {
    const stop = (normal: number): Expr => ['case', SELECTED, normal * 1.6 + 2, HOVER, normal * 1.4, normal];
    return ['interpolate', ['linear'], ['zoom'], 4, stop(3), 7, stop(4.5), 10, stop(6.5), 13, stop(8.5)];
  }
  function strokeWidth(): Expr {
    return ['interpolate', ['linear'], ['zoom'], 4, ['case', SELECTED, 2.5, 1], 10, ['case', SELECTED, 4, 2]];
  }

  function addOverlays() {
    if (map) addStyleOverlays(map, untrack(() => styleDef), untrack(() => app.dark));
  }

  function addLayers() {
    if (!map) return;
    addOverlays();
    const baseDark = untrack(() => styleDef.isDark(app.dark));
    // No clustering: nearby activities simply overlap (dots shrink when zoomed out).
    map.addSource(SRC, { type: 'geojson', data: untrack(() => geojson), promoteId: 'id' });
    map.addLayer({
      id: 'points',
      type: 'circle',
      source: SRC,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': radius(),
        'circle-stroke-width': strokeWidth(),
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'point-labels',
      type: 'symbol',
      source: SRC,
      minzoom: 8,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: {
        'text-color': baseDark ? '#f1f5f9' : '#1e293b',
        'text-halo-color': baseDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)',
        'text-halo-width': 1.6,
      },
    });
    addTripLayers(baseDark);
    applyMode();
    styleReady = true;
    syncSelection();
  }

  function addTripLayers(baseDark: boolean) {
    if (!map) return;
    const ACTIVE: Expr = ['==', ['get', 'active'], 1];
    const halo = baseDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';
    map.addSource('trip-path', { type: 'geojson', data: untrack(() => pathData) });
    ensurePies();
    map.addSource('trip-stops', { type: 'geojson', data: untrack(() => stopData) });
    map.addSource('trip-acts', { type: 'geojson', data: untrack(() => tripActs) });
    map.addLayer({
      id: 'path-casing',
      type: 'line',
      source: 'trip-path',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.7 },
    });
    map.addLayer({
      id: 'path',
      type: 'line',
      source: 'trip-path',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#8b5cf6', 'line-width': 3, 'line-dasharray': [1.5, 1.5] },
    });
    map.addLayer({
      id: 'trip-acts',
      type: 'circle',
      source: 'trip-acts',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['case', ACTIVE, 5, 2.5], 10, ['case', ACTIVE, 9, 5]],
        'circle-opacity': ['case', ACTIVE, 1, 0.45],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['==', ['get', 'hover'], 1], 4, ACTIVE, 2, 1],
        'circle-stroke-opacity': ['case', ACTIVE, 1, 0.6],
      },
    });
    map.addLayer({
      id: 'trip-acts-label',
      type: 'symbol',
      source: 'trip-acts',
      filter: ACTIVE,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': baseDark ? '#f1f5f9' : '#1e293b', 'text-halo-color': halo, 'text-halo-width': 1.5 },
    });
    map.addLayer({
      id: 'stops',
      type: 'symbol',
      source: 'trip-stops',
      layout: {
        'icon-image': ['get', 'pie'],
        'icon-size': ['case', ACTIVE, 1, PIE_SMALL],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'active'],
      },
    });
    map.addLayer({
      id: 'stops-label',
      type: 'symbol',
      source: 'trip-stops',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['case', ACTIVE, 13, 11],
        'text-offset': ['case', ACTIVE, ['literal', [0, -1.45]], ['literal', [0, -1.2]]],
        'text-anchor': 'bottom',
      },
      paint: {
        'text-color': ['case', ACTIVE, '#7c3aed', baseDark ? '#e2e8f0' : '#334155'],
        'text-halo-color': halo,
        'text-halo-width': 1.8,
      },
    });
  }

  /** Show the layers of the current mode only. */
  function applyMode() {
    if (!map) return;
    const trip = untrack(() => app.mode) === 'itinerary';
    for (const id of EXPLORE_LAYERS) map.setLayoutProperty(id, 'visibility', trip ? 'none' : 'visible');
    for (const id of TRIP_LAYERS) map.setLayoutProperty(id, 'visibility', trip ? 'visible' : 'none');
  }

  let prevSelected: string | null = null;
  function syncSelection() {
    if (!map || !styleReady) return;
    if (prevSelected) map.setFeatureState({ source: SRC, id: prevSelected }, { selected: false });
    const a = app.selectedActivity;
    prevSelected = a?.id ?? null;
    if (a && a.lat !== undefined) {
      map.setFeatureState({ source: SRC, id: a.id }, { selected: true });
    }
    bubble?.remove();
    bubble = undefined;
    if (a && a.lat !== undefined && a.lng !== undefined) {
      const img = a.images[0] ? images.url(a.images[0]) : undefined;
      if (img) {
        const el = document.createElement('div');
        el.className = 'photo-bubble';
        el.style.backgroundImage = `url("${encodeURI(img)}")`;
        el.title = a.name;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          app.lightbox = { images: a.images, index: 0 };
        });
        bubble = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -18] })
          .setLngLat([a.lng, a.lat])
          .addTo(map);
      }
    }
  }

  type Pad = { top: number; right: number; bottom: number; left: number };
  /** Smallest map area (px) a fit is squeezed into. */
  const MIN_VIEW = 48;

  /**
   * Padding for fits and fly-tos: the `padding` prop (panels, bottom sheet, toolbar covering the map)
   * plus a `margin` around the content. MapLibre silently ignores fitBounds/flyTo when the padding
   * leaves no room on the canvas, so when space is short the margin shrinks first, then the smaller
   * inset of the axis (toolbar rather than an expanded bottom sheet): the points always land in the
   * map area that is actually visible, however small.
   */
  function viewPadding(margin: number): Pad {
    const p = padding;
    if (!map) return p;
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const axis = (size: number, a: number, b: number): [number, number] => {
      const room = size - a - b;
      const m = Math.max(0, Math.min(margin, (room - MIN_VIEW) / 2));
      a += m;
      b += m;
      let need = MIN_VIEW - (size - a - b);
      if (need > 0) {
        // Shrink the smaller inset first, then the other.
        const small = Math.min(need, a <= b ? a : b);
        if (a <= b) a -= small;
        else b -= small;
        need -= small;
        if (need > 0) {
          if (a > b) a = Math.max(0, a - need);
          else b = Math.max(0, b - need);
        }
      }
      return [a, b];
    };
    const [left, right] = axis(w, p.left, p.right);
    const [top, bottom] = axis(h, p.top, p.bottom);
    return { top, right, bottom, left };
  }

  function fitBounds(b: maplibregl.LngLatBounds, maxZoom: number, animate: boolean) {
    if (!map || b.isEmpty()) return;
    map.fitBounds(b, { padding: viewPadding(mobile() ? 28 : 60), maxZoom, duration: animate ? 900 : 0 });
  }

  /** Narrow screens: less margin around fitted content. */
  const mobile = () => !!map && map.getContainer().clientWidth < 600;

  function fitToData(animate = true) {
    const b = new maplibregl.LngLatBounds();
    for (const a of placed) b.extend([a.lng!, a.lat!]);
    fitBounds(b, 13, animate);
  }

  /**
   * Itinerary: fit the active day, else the whole trip. A day covers its activities, plus last night's
   * and tonight's stop when it is a travel day; a selected stop covers the activities of all its nights.
   */
  function fitTrip(animate = true) {
    const b = new maplibregl.LngLatBounds();
    const days = app.days;
    const i = days.findIndex((d) => d.id === app.activeDayId);
    const focus = app.activeStayDayIds;
    const extendActs = (d: (typeof days)[number]) => {
      for (const id of d.activityIds) {
        const a = byId.get(id);
        if (a?.lat !== undefined) b.extend([a.lng!, a.lat]);
      }
    };
    if (i >= 0 && focus?.includes(days[i].id)) {
      for (const d of days) if (focus.includes(d.id)) extendActs(d);
      const st = tripStays.find((s) => s.dayIds.includes(days[i].id));
      if (b.isEmpty() && st) b.extend([st.lng!, st.lat!]);
    } else if (i >= 0) {
      const d = days[i];
      const prev = days[i - 1];
      extendActs(d);
      const moved = !!prev && prev.lat !== undefined && d.lat !== undefined && (prev.lat !== d.lat || prev.lng !== d.lng);
      if (moved || d.travel || b.isEmpty()) for (const dd of [d, prev]) if (dd?.lat !== undefined) b.extend([dd.lng!, dd.lat]);
    }
    if (b.isEmpty()) {
      for (const st of tripStays) b.extend([st.lng!, st.lat!]);
      for (const f of tripActs.features) b.extend((f.geometry as GeoJSON.Point).coordinates as [number, number]);
    }
    fitBounds(b, 12, animate);
  }

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: untrack(() => styleDef.style(app.dark)),
      maxPitch: 75,
      // Tilt is user-controlled: right-drag / ctrl+drag with the mouse, two-finger drag on touch.
      dragRotate: true,
      touchPitch: true,
      bounds: JAPAN,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
      // Tiles are served from the offline cache on the main thread (see maplibre.ts).
      transformRequest,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '240px' });

    map.on('style.load', addLayers);

    let hovered: { id: string; source: string } | null = null;
    const onMove = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || !map) return;
      const id = String(f.properties.id);
      map.getCanvas().style.cursor = 'pointer';
      if (hovered?.id === id) return;
      if (hovered && hovered.source === SRC) map.setFeatureState(hovered, { hover: false });
      hovered = { id, source: f.source };
      app.hoveredId = id;
      if (f.source === SRC) map.setFeatureState(hovered, { hover: true });
      const a = byId.get(id);
      if (a && id !== app.selectedId) {
        hoverPopup!.setLngLat([a.lng!, a.lat!]).setHTML(popupHtml(a)).addTo(map);
      }
    };
    const onLeave = () => {
      if (!map) return;
      map.getCanvas().style.cursor = '';
      if (hovered && hovered.source === SRC) map.setFeatureState(hovered, { hover: false });
      hovered = null;
      app.hoveredId = null;
      hoverPopup?.remove();
    };
    for (const layer of POINT_LAYERS) {
      map.on('mousemove', layer, onMove);
      map.on('mouseleave', layer, onLeave);
    }
    map.on('mouseenter', 'stops', () => map && (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'stops', () => map && (map.getCanvas().style.cursor = ''));

    // ---- taps ----
    // Fingers are imprecise and dots are small: a tap selects the nearest marker within a forgiving
    // radius instead of requiring an exact hit. MapLibre already drops "clicks" that moved (pans);
    // on top of that, a tap that only stops a moving map (fling, zoom animation) or ends a pinch
    // selects nothing and keeps the current selection. Touch taps wait briefly so the first tap of a
    // double-tap zoom does not select anything either.
    const canvasEl = map.getCanvasContainer();
    const down = new Set<number>();
    let tap = { type: 'mouse', settling: false, multi: false, moved: false };
    let pendingTap: ReturnType<typeof setTimeout> | undefined;
    let moving = false;
    canvasEl.addEventListener(
      'pointerdown',
      (e) => {
        // Capture phase: runs before MapLibre stops the running animation.
        clearTimeout(pendingTap);
        if (!down.size) tap = { type: e.pointerType || 'mouse', settling: moving, multi: false, moved: false };
        down.add(e.pointerId);
        if (down.size > 1) tap.multi = true;
      },
      true,
    );
    for (const type of ['pointerup', 'pointercancel'] as const) {
      canvasEl.addEventListener(type, (e) => down.delete(e.pointerId), true);
    }

    const onTap = (point: maplibregl.Point, type: string) => {
      const hit = pick(point, TAP_RADIUS[type] ?? TAP_RADIUS.mouse);
      if (!hit) {
        app.selectedId = null;
      } else if (hit.layer.id === 'stops') {
        const st = tripStays[Number(hit.properties.stay)];
        if (st) app.selectStay(st.dayIds, true);
      } else {
        hoverPopup?.remove();
        app.selectedId = String(hit.properties.id);
      }
    };
    map.on('click', (e) => {
      if (!map || tap.settling || tap.multi || tap.moved) return;
      const { type } = tap;
      if (type === 'touch') pendingTap = setTimeout(() => onTap(e.point, type), DOUBLE_TAP_MS);
      else onTap(e.point, type);
    });
    map.on('movestart', () => {
      // The camera moved during this tap (e.g. a double-tap zoom, which starts before its click).
      moving = tap.moved = true;
      clearTimeout(pendingTap);
    });
    map.on('moveend', () => (moving = false));
  });

  /** A second tap within this time is a double-tap zoom, not a selection. */
  const DOUBLE_TAP_MS = 250;
  /** Extra hit radius (css px) around markers, by pointer type. */
  const TAP_RADIUS: Record<string, number> = { touch: 24, pen: 14, mouse: 6 };

  /**
   * The marker a tap at `point` means: the one whose edge is closest, within `slop` px. Exact hits win
   * (distance 0), so overlapping markers still resolve to the one drawn under the finger.
   */
  function pick(point: maplibregl.Point, slop: number): maplibregl.MapGeoJSONFeature | undefined {
    if (!map) return undefined;
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [point.x - slop, point.y - slop],
      [point.x + slop, point.y + slop],
    ];
    const zoom = map.getZoom();
    let best: maplibregl.MapGeoJSONFeature | undefined;
    let bestDist = Infinity;
    // Topmost layer first, so ties go to what is drawn on top.
    for (const f of map.queryRenderedFeatures(box, { layers: ['stops', ...POINT_LAYERS] })) {
      if (f.geometry.type !== 'Point') continue;
      const c = map.project(f.geometry.coordinates as [number, number]);
      const size =
        f.layer.id === 'stops'
          ? (PIE_SIZE / 2) * (f.properties.active ? 1 : PIE_SMALL)
          : zoom < 7
            ? 4
            : zoom < 11
              ? 6
              : 9; // roughly the drawn dot radius
      const d = Math.max(0, Math.hypot(c.x - point.x, c.y - point.y) - size);
      if (d <= slop && d < bestDist) {
        best = f;
        bestDist = d;
      }
    }
    return best;
  }

  onDestroy(() => map?.remove());

  // Keep source data in sync.
  $effect(() => {
    const data = geojson;
    if (!styleReady || !map) return;
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(data);
    untrack(syncSelection);
  });
  $effect(() => {
    const p = pathData;
    const st = stopData;
    const a = tripActs;
    if (!styleReady || !map) return;
    ensurePies();
    (map.getSource('trip-path') as GeoJSONSource | undefined)?.setData(p);
    (map.getSource('trip-stops') as GeoJSONSource | undefined)?.setData(st);
    (map.getSource('trip-acts') as GeoJSONSource | undefined)?.setData(a);
  });

  // Mode switch → swap layer visibility and re-frame (same map, no reload).
  let lastMode: string | undefined;
  $effect(() => {
    const mode = app.mode;
    if (!styleReady) return;
    untrack(applyMode);
    if (mode === lastMode) return;
    const first = lastMode === undefined;
    lastMode = mode;
    if (mode === 'explore') lastFitKey = '';
    else if (!first) untrack(() => fitTrip(true));
  });

  // Explore: re-fit when the filtered set changes (not on recolor).
  $effect(() => {
    const key = placed.map((a) => a.id).join(',');
    if (!styleReady || app.mode !== 'explore' || key === lastFitKey) return;
    const first = lastFitKey === '' && lastMode === undefined;
    lastFitKey = key;
    untrack(() => fitToData(!first));
  });

  // Itinerary: follow the active day.
  $effect(() => {
    void app.activeDayId;
    void app.activeStayDayIds;
    void app.days;
    if (!styleReady || app.mode !== 'itinerary') return;
    untrack(() => fitTrip(true));
  });

  // Map style or theme switch → swap basemap (overlays + our layers are re-added on style.load).
  let currentKey: string | undefined;
  $effect(() => {
    const key = styleKey;
    if (!map) return;
    if (currentKey === undefined) {
      currentKey = key;
      return;
    }
    if (currentKey === key) return;
    const prevId = currentKey.split('|')[0];
    currentKey = key;
    const def = untrack(() => styleDef);
    styleReady = false;
    map.setStyle(def.style(untrack(() => app.dark)), { diff: false });
    // Terrain starts flat (tilt manually for 3D); flatten again when leaving it.
    if (!def.terrain3d && prevId === 'terrain' && map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 800 });
  });

  // Selection → highlight, photo bubble, fly to.
  let lastFlown: string | null = null;
  $effect(() => {
    const id = app.selectedId;
    if (!map || !styleReady) return;
    untrack(syncSelection);
    const a = untrack(() => app.selectedActivity);
    if (id === lastFlown) return;
    lastFlown = id;
    if (a && a.lat !== undefined && a.lng !== undefined) {
      untrack(() => {
        // Use an offset, not `padding`: padding passed to flyTo persists on the map and is added
        // to every later fitBounds padding, so day fits would no longer fit the canvas.
        const p = viewPadding(0);
        map!.flyTo({
          center: [a.lng!, a.lat!],
          zoom: Math.max(map!.getZoom(), app.mode === 'itinerary' ? 11 : 12),
          offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2],
          speed: 1.4,
          essential: true,
        });
      });
    }
  });

  /** Frame everything of the current mode (explore: filtered activities; itinerary: whole trip). */
  export function fit() {
    if (app.mode === 'itinerary') {
      app.activeDayId = null;
      fitTrip(true);
    } else fitToData(true);
  }
</script>

<div class="absolute inset-0">
  <div bind:this={container} class="h-full w-full"></div>
</div>
