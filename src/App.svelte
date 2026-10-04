<script lang="ts">
  import { CircleAlert, Maximize } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { app } from './lib/state.svelte';
  import ActivityList from './lib/components/ActivityList.svelte';
  import DetailDrawer from './lib/components/DetailDrawer.svelte';
  import FieldMapping from './lib/components/FieldMapping.svelte';
  import Filters from './lib/components/Filters.svelte';
  import Legend from './lib/components/Legend.svelte';
  import Lightbox from './lib/components/Lightbox.svelte';
  import MapView from './lib/components/Map.svelte';
  import SettingsModal from './lib/components/SettingsModal.svelte';
  import Toasts from './lib/components/Toasts.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import ModeSwitch from './lib/components/ModeSwitch.svelte';
  import ItineraryPanel from './lib/components/ItineraryPanel.svelte';

  let mapView: ReturnType<typeof MapView> | undefined = $state();
  let width = $state(window.innerWidth);
  let height = $state(window.innerHeight);
  const mobile = $derived(width < 960);

  // ---- mobile bottom sheet ----
  const SNAPS = [0.2, 0.5, 0.88];
  let snap = $state(0);
  let dragOffset = $state(0);
  let dragging = $state(false);
  let dragStartY = 0;
  const sheetPx = $derived(Math.round(height * SNAPS[snap]) - dragOffset);

  function onDragStart(e: PointerEvent) {
    dragging = true;
    dragStartY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDragMove(e: PointerEvent) {
    if (dragging) dragOffset = e.clientY - dragStartY;
  }
  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    const target = (height * SNAPS[snap] - dragOffset) / height;
    let best = 0;
    SNAPS.forEach((s, i) => Math.abs(s - target) < Math.abs(SNAPS[best] - target) && (best = i));
    if (Math.abs(dragOffset) < 6) best = (snap + 1) % SNAPS.length; // tap toggles
    snap = best;
    dragOffset = 0;
  }

  /** Desktop sidebar width: narrow list for exploring, wider for the day-by-day itinerary (animated). */
  const sideW = $derived(app.mode === 'itinerary' ? Math.min(660, Math.max(540, Math.round(width * 0.46))) : 384);
  const SIDE_ANIM = 'transition-property: width, left; transition-duration: 450ms; transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1)';

  const padding = $derived(
    mobile
      ? { top: 110, right: 10, bottom: app.selectedActivity ? Math.round(height * 0.62) : sheetPx, left: 10 }
      : { top: 70, right: app.selectedActivity ? 430 : 20, bottom: 30, left: sideW + 26 },
  );

  $effect(() => {
    document.documentElement.classList.toggle('dark', app.dark);
  });

  onMount(() => {
    void app.init();
  });
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<main
  class="relative h-full w-full overflow-clip"
  style="--ctrl-bottom:{mobile ? (app.selectedActivity ? Math.round(height * 0.62) : sheetPx) : 0}px"
>
  <MapView bind:this={mapView} {padding} />

  {#if mobile}
    <div class="absolute top-3 right-3 left-3 z-20 flex flex-wrap items-start justify-between gap-2">
      <ModeSwitch compact />
      <Toolbar />
    </div>
  {/if}

  <!-- Unresolved-columns banner -->
  {#if app.resolved?.unresolved.length && !app.showMapping}
    <div class="absolute z-20 {mobile ? 'top-[108px] left-3 right-3' : 'top-[68px] left-[410px]'}" transition:fly={{ y: -10 }}>
      <button
        class="glass flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm text-amber-700 dark:text-amber-300"
        onclick={() => (app.showMapping = true)}
      >
        <CircleAlert class="size-4" />
        {app.resolved.unresolved.length} column{app.resolved.unresolved.length > 1 ? 's' : ''} not found in Airtable
        <span class="font-semibold underline">Fix mapping</span>
      </button>
    </div>
  {/if}

  <!-- Paused rating session (drawer closed or another activity selected) -->
  {#if app.rating && app.mode === 'explore' && app.selectedId !== app.ratingCurrentId}
    <div class="absolute bottom-6 left-1/2 z-30 -translate-x-1/2" transition:fly={{ y: 20 }}>
      <div class="glass flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4 text-sm">
        <span>Rating paused · {app.rating.index + 1}/{app.rating.queue.length}</span>
        <button
          class="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700"
          onclick={() => (app.selectedId = app.ratingCurrentId)}>Resume</button
        >
        <button class="text-muted rounded-full px-2 py-1 text-xs hover:bg-slate-500/10" onclick={() => app.stopRating()}>Stop</button>
      </div>
    </div>
  {/if}

  {#if !mobile}
    <!-- Desktop side panel: one panel for both modes, width animates when switching -->
    <aside class="glass absolute top-3 bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-3xl" style="width:{sideW}px;{SIDE_ANIM}">
      <header class="flex items-center gap-3 px-5 pt-5 pb-3">
        <img src="./favicon.svg" alt="" class="size-9 drop-shadow" />
        <div class="min-w-0 flex-1">
          <h1 class="text-xl leading-none font-extrabold tracking-tight">Oreas</h1>
          <p class="text-muted mt-1 truncate text-xs">
            {(app.mode === 'itinerary' ? app.resolvedDays : app.resolved)?.table?.name ?? 'Travel planner'}
          </p>
        </div>
        <button
          class="text-muted rounded-xl p-2 transition hover:bg-slate-500/10"
          title={app.mode === 'itinerary' ? 'Show whole trip' : 'Fit map to activities'}
          onclick={() => mapView?.fit()}
        >
          <Maximize class="size-4" />
        </button>
      </header>
      <div class="px-5 pb-3"><ModeSwitch /></div>
      {#key app.mode}
        <div class="flex min-h-0 flex-1 flex-col" in:fade={{ duration: 220, delay: 150 }}>
          {#if app.mode === 'explore'}
            <div class="border-b border-[var(--hairline)] px-5 pb-4"><Filters /></div>
            <div class="scroll-thin flex-1 overflow-y-auto px-3 py-3"><ActivityList /></div>
          {:else}
            <ItineraryPanel />
          {/if}
        </div>
      {/key}
    </aside>

    <div class="absolute bottom-3 z-10" style="left:{sideW + 26}px;{SIDE_ANIM}"><Legend /></div>

    <!-- Right column: toolbar + detail drawer (drawer always starts below the toolbar) -->
    <div
      class="pointer-events-none absolute top-3 right-3 bottom-3 z-20 flex flex-col items-end gap-3"
      style="left:{sideW + 26}px;{SIDE_ANIM}"
    >
      <div class="pointer-events-auto"><Toolbar /></div>
      {#if app.selectedActivity}
        <aside
          class="glass pointer-events-auto min-h-0 w-[400px] flex-1 overflow-hidden rounded-3xl"
          transition:fly={{ x: 420, duration: 280, opacity: 1 }}
        >
          {#key app.selectedActivity.id}
            <DetailDrawer activity={app.selectedActivity} />
          {/key}
        </aside>
      {/if}
    </div>
  {:else}
    <!-- Mobile bottom sheet -->
    {#if !app.selectedActivity}
      <section
        class="glass absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-3xl {dragging ? '' : 'transition-[height] duration-300 ease-out'}"
        style="height:{sheetPx}px"
        transition:fly={{ y: 300, duration: 250 }}
      >
        <div
          class="flex shrink-0 cursor-grab touch-none flex-col items-center px-5 pt-2.5 pb-2 active:cursor-grabbing"
          role="slider"
          aria-label="Resize list"
          aria-valuenow={snap}
          tabindex="0"
          onpointerdown={onDragStart}
          onpointermove={onDragMove}
          onpointerup={onDragEnd}
          onpointercancel={onDragEnd}
        >
          <div class="h-1.5 w-10 rounded-full bg-slate-400/60"></div>
          <div class="mt-2 flex w-full items-center gap-2">
            <img src="./favicon.svg" alt="" class="size-6" />
            <span class="font-extrabold tracking-tight">Oreas</span>
            <span class="text-muted ml-auto text-xs">
              {app.mode === 'itinerary' ? `${app.days.length} days` : `${app.filtered.length} activities`}
            </span>
          </div>
        </div>
        {#key app.mode}
          <div
            class="min-h-0 flex-1 {app.mode === 'explore' ? 'scroll-thin overflow-y-auto px-4 pb-6' : 'flex flex-col'}"
            in:fade={{ duration: 200 }}
          >
            {#if app.mode === 'explore'}
              <div class="mb-3"><Filters /></div>
              <ActivityList />
            {:else}
              <ItineraryPanel />
            {/if}
          </div>
        {/key}
      </section>
    {:else}
      <section
        class="absolute inset-x-0 bottom-0 z-30 h-[62dvh] overflow-hidden rounded-t-3xl glass-strong"
        transition:fly={{ y: 400, duration: 280, opacity: 1 }}
      >
        {#key app.selectedActivity.id}
          <DetailDrawer activity={app.selectedActivity} />
        {/key}
      </section>
    {/if}
  {/if}

  {#if !app.ready}
    <div class="absolute inset-0 z-40 flex items-center justify-center bg-[var(--bg)]">
      <img src="./favicon.svg" alt="Loading" class="size-14 animate-pulse" />
    </div>
  {/if}
</main>

{#if app.showSettings}<SettingsModal />{/if}
{#if app.showMapping && !app.showSettings}<FieldMapping />{/if}
{#if app.lightbox}<Lightbox />{/if}
<Toasts />
