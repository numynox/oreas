<script lang="ts">
  import { CloudOff, HardDriveDownload, Map as MapIcon, ShieldCheck, Trash2, Wifi } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { app } from '../state.svelte';
  import { formatBytes, images } from '../images.svelte';
  import { offlineMap } from '../offlineMap.svelte';

  onMount(() => {
    void app.refreshStorage();
    void offlineMap.refresh();
  });

  const plan = $derived(app.mapPlan);
  const busy = $derived(!!images.progress || !!offlineMap.progress);
  const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const total = $derived(app.allImages.length);
  const ids = $derived(new Set(app.allImages.map((a) => a.id)));
  const thumbs = $derived([...ids].filter((id) => images.has(id, 'large')).length);
  const originals = $derived([...ids].filter((id) => images.has(id, 'full')).length);
  const dataBytes = $derived.by(() => {
    void app.cache;
    return app.dataBytes();
  });
  const complete = $derived(total > 0 && thumbs === total && originals === total);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
</script>

<section class="space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold">Offline</h3>
    {#if app.online}
      <span class="flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <Wifi class="size-3.5" /> Online
      </span>
    {:else}
      <span class="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <CloudOff class="size-3.5" /> Offline – showing cached data
      </span>
    {/if}
  </div>

  <div class="grid grid-cols-3 gap-2 text-center">
    <div class="rounded-2xl bg-slate-500/8 p-3">
      <div class="text-sm font-semibold">{app.cache?.records.length ?? 0}</div>
      <div class="text-muted text-[11px]">records · {formatBytes(dataBytes)}</div>
    </div>
    <div class="rounded-2xl bg-slate-500/8 p-3">
      <div class="text-sm font-semibold">{thumbs}/{total}</div>
      <div class="text-muted text-[11px]">thumbnails</div>
      <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-500/15">
        <div class="h-full rounded-full bg-violet-500 transition-all" style="width:{pct(thumbs, total)}%"></div>
      </div>
    </div>
    <div class="rounded-2xl bg-slate-500/8 p-3">
      <div class="text-sm font-semibold">{originals}/{total}</div>
      <div class="text-muted text-[11px]">full-size images</div>
      <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-500/15">
        <div class="h-full rounded-full bg-violet-500 transition-all" style="width:{pct(originals, total)}%"></div>
      </div>
    </div>
  </div>

  <p class="text-muted text-xs">
    Images stored: <b class="text-[var(--text)]">{formatBytes(images.bytes)}</b>
    {#if app.storage}
      · browser storage used by Oreas: {formatBytes(app.storage.usage)} of {formatBytes(app.storage.quota)} available
    {/if}
  </p>

  {#if images.progress}
    <div class="space-y-1.5 rounded-2xl bg-violet-500/10 p-3">
      <div class="flex items-center justify-between text-xs">
        <span>{images.progress.label}… {images.progress.done}/{images.progress.total}</span>
        <button class="text-violet-600 hover:underline dark:text-violet-400" onclick={() => images.cancel()}>Cancel</button>
      </div>
      <div class="h-1.5 overflow-hidden rounded-full bg-slate-500/15">
        <div class="h-full rounded-full bg-violet-500 transition-all" style="width:{pct(images.progress.done, images.progress.total)}%"></div>
      </div>
    </div>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button
      class="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
      disabled={!app.online || busy || complete || app.syncing}
      onclick={() => app.downloadEverything()}
    >
      <HardDriveDownload class="size-4" />
      {complete ? 'Everything is available offline' : 'Download everything for offline'}
    </button>
    {#if images.bytes > 0}
      <button
        class="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-slate-500/10 disabled:opacity-40"
        disabled={!!images.progress}
        onclick={() => app.clearImages()}
      >
        <Trash2 class="size-4" /> Clear images
      </button>
    {/if}
  </div>
  <p class="text-muted text-xs">
    Thumbnails are saved automatically after each sync. Full-size images are saved when you open them, or all at once with
    the button above.
  </p>

  <div class="space-y-2 border-t border-[var(--hairline)] pt-3">
    <h4 class="flex items-center gap-1.5 text-sm font-semibold"><MapIcon class="size-4" /> Offline map</h4>
    {#if !offlineMap.supported}
      <p class="text-muted text-xs">This browser (or private window) does not support offline storage for the app and map.</p>
    {:else if !offlineMap.controlled}
      <p class="text-muted text-xs">
        The offline worker is not active yet{import.meta.env.DEV ? ' (it only runs in the production build)' : ' – reload the page once'}. Until then the
        map needs a connection.
      </p>
    {:else}
      <p class="text-muted text-xs">
        Every map area you view is kept for offline use. Download the whole area covered by your
        {app.mapPoints.length} place{app.mapPoints.length === 1 ? '' : 's'} ahead of time: an overview up to zoom {plan.overviewZoom}
        and street level around each place (≈ {plan.tiles.length.toLocaleString()} tiles, for Streets and Minimal).
      </p>
      <p class="text-muted text-xs">
        Map files cached: <b class="text-[var(--text)]">{offlineMap.cachedTiles?.toLocaleString() ?? '–'}</b>
        {#if offlineMap.last}
          · last download {fmtDate(offlineMap.last.at)}: {offlineMap.last.tiles.toLocaleString()} files, {formatBytes(offlineMap.last.bytes)}
        {/if}
      </p>
    {/if}

    {#if offlineMap.progress}
      <div class="space-y-1.5 rounded-2xl bg-violet-500/10 p-3">
        <div class="flex items-center justify-between text-xs">
          <span>
            Downloading map… {offlineMap.progress.done.toLocaleString()}/{offlineMap.progress.total.toLocaleString()} · {formatBytes(offlineMap.progress.bytes)}
          </span>
          <button class="text-violet-600 hover:underline dark:text-violet-400" onclick={() => offlineMap.cancel()}>Cancel</button>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-slate-500/15">
          <div class="h-full rounded-full bg-violet-500 transition-all" style="width:{pct(offlineMap.progress.done, offlineMap.progress.total)}%"></div>
        </div>
      </div>
    {/if}

    {#if offlineMap.supported && offlineMap.controlled}
      <div class="flex flex-wrap gap-2">
        <button
          class="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
          disabled={!app.online || busy || !app.mapPoints.length}
          onclick={() => app.downloadMap()}
        >
          <HardDriveDownload class="size-4" /> Download map of activity area
        </button>
        {#if offlineMap.cachedTiles}
          <button
            class="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-slate-500/10 disabled:opacity-40"
            disabled={!!offlineMap.progress}
            onclick={async () => {
              await offlineMap.clear();
              await app.refreshStorage();
            }}
          >
            <Trash2 class="size-4" /> Clear map
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <div class="flex items-start gap-2 border-t border-[var(--hairline)] pt-3 text-xs">
    <ShieldCheck class="mt-0.5 size-4 shrink-0 {offlineMap.persisted ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}" />
    <div class="flex-1 space-y-1">
      {#if offlineMap.persisted}
        <p><b>Storage is persistent</b> – the browser will not clear offline data on its own.</p>
      {:else}
        <p>
          <b>Storage is not persistent</b>{offlineMap.persisted === null ? ' (or the browser cannot tell)' : ''} – the browser may clear
          offline data when space runs low. Safari may also clear it after ~7 days without use unless Oreas is added to the home
          screen.
        </p>
        <button class="text-violet-600 hover:underline dark:text-violet-400" onclick={() => offlineMap.persist()}>
          Make storage persistent
        </button>
      {/if}
    </div>
  </div>
</section>
