<script lang="ts">
  import { CloudOff, CloudUpload, Monitor, Moon, Palette, RefreshCw, Settings, Star, Sun } from '@lucide/svelte';
  import { images } from '../images.svelte';
  import MapStylePicker from './MapStylePicker.svelte';
  import { FACETS, app, type FacetKey } from '../state.svelte';

  const colorOptions = $derived(FACETS.filter((f) => app.resolved?.fields[f.key] && app.facets[f.key]?.length));

  function ago(ts?: number) {
    if (!ts) return 'never';
    const s = Math.round((app.now - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  }

  const nextTheme = { system: 'light', light: 'dark', dark: 'system' } as const;
</script>

<div class="flex flex-wrap items-center justify-end gap-2">
  {#if colorOptions.length}
    <label class="glass flex items-center gap-1.5 rounded-2xl py-1 pr-1 pl-2.5 text-xs">
      <Palette class="text-muted size-4" />
      <span class="text-muted hidden sm:inline">Color by</span>
      <select
        class="cursor-pointer rounded-xl bg-transparent py-1.5 pr-1 font-medium outline-none"
        value={app.colorBy}
        onchange={(e) => {
          app.colorBy = e.currentTarget.value as FacetKey;
          app.persistUi();
        }}
      >
        {#each colorOptions as o (o.key)}
          <option value={o.key}>{o.label}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if app.resolved?.fields.priority && app.mode === 'explore'}
    <button
      class="glass flex items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-semibold transition hover:brightness-105 {app.rating
        ? 'ring-2 ring-violet-500/70'
        : ''}"
      title={app.rating ? 'Stop rating' : `Rate ${app.unrated.length} unrated activities`}
      onclick={() => (app.rating ? app.stopRating() : app.startRating())}
    >
      <Star class="size-4 text-amber-500 {app.rating ? 'fill-amber-400' : ''}" />
      {#if app.rating}
        <span class="tabular-nums">{app.rating.index + 1}/{app.rating.queue.length}</span>
      {:else}
        <span>Rate</span>
        {#if app.unrated.length}
          <span class="rounded-full bg-violet-600 px-1.5 text-[10px] text-white tabular-nums">{app.unrated.length}</span>
        {/if}
      {/if}
    </button>
  {/if}

  <MapStylePicker />

  <div class="glass flex items-center gap-0.5 rounded-2xl p-1">
    {#if app.pending.length}
      <span
        class="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs text-violet-600 tabular-nums dark:text-violet-400"
        title="{app.pending.length} change(s) waiting to be saved to Airtable"
      >
        <CloudUpload class="size-4" />{app.pending.length}
      </span>
    {/if}
    {#if !app.online}
      <button
        class="flex items-center gap-1.5 rounded-xl bg-amber-500/15 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
        title="You are offline – showing cached data"
        onclick={() => (app.showSettings = true)}
      >
        <CloudOff class="size-4" /><span class="hidden md:inline">Offline</span>
      </button>
    {:else if images.progress}
      <button
        class="text-muted rounded-xl px-2 py-1.5 text-xs tabular-nums"
        title={images.progress.label}
        onclick={() => (app.showSettings = true)}
      >
        {Math.round((images.progress.done / images.progress.total) * 100)}%
      </button>
    {/if}
    <button
      class="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs transition hover:bg-slate-500/10 disabled:opacity-60"
      title="Sync from Airtable (last synced {ago(app.cache?.fetchedAt)})"
      disabled={app.syncing || !app.online}
      onclick={() => app.sync()}
    >
      <RefreshCw class="size-4 {app.syncing ? 'animate-spin text-violet-500' : ''}" />
      <span class="text-muted hidden md:inline">{app.syncing ? 'Syncing…' : ago(app.cache?.fetchedAt)}</span>
    </button>
    <button
      class="rounded-xl p-1.5 transition hover:bg-slate-500/10"
      title="Theme: {app.theme}"
      onclick={() => {
        app.theme = nextTheme[app.theme];
        app.persistUi();
      }}
    >
      {#if app.theme === 'system'}<Monitor class="size-4" />{:else if app.theme === 'dark'}<Moon class="size-4" />{:else}<Sun class="size-4" />{/if}
    </button>
    <button class="rounded-xl p-1.5 transition hover:bg-slate-500/10" title="Settings" onclick={() => (app.showSettings = true)}>
      <Settings class="size-4" />
    </button>
  </div>
</div>
