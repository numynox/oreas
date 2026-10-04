<script lang="ts">
  import { ChevronDown, EyeOff, Search, X } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { FACETS, app } from '../state.svelte';

  let open = $state(false);
  const LIMIT = 6;
  let expanded = $state<Record<string, boolean>>({});
  const visible = $derived(FACETS.filter((f) => app.resolved?.fields[f.key] && app.facets[f.key]?.length));
</script>

<div class="space-y-3">
  <label class="group relative block">
    <Search class="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
    <input
      type="search"
      placeholder="Search activities, places, notes…"
      bind:value={app.search}
      class="w-full rounded-xl border border-[var(--border)] bg-white/45 py-2.5 pr-9 pl-9 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15 dark:bg-slate-900/35"
    />
    {#if app.search}
      <button
        class="text-muted absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 hover:bg-slate-500/10"
        aria-label="Clear search"
        onclick={() => (app.search = '')}
      >
        <X class="size-3.5" />
      </button>
    {/if}
  </label>

  <div class="flex items-center justify-between">
    <button class="flex items-center gap-1 text-xs font-semibold tracking-wide uppercase text-muted" onclick={() => (open = !open)}>
      <ChevronDown class="size-3.5 transition {open ? '' : '-rotate-90'}" />
      Filters
      {#if app.activeFilterCount}
        <span class="ml-1 rounded-full bg-violet-500 px-1.5 text-[10px] text-white">{app.activeFilterCount}</span>
      {/if}
    </button>
    <div class="flex items-center gap-3">
      <button
        class="flex items-center gap-1 text-xs transition {app.hideInactive ? 'text-violet-600 dark:text-violet-400' : 'text-muted'}"
        title="Hide skipped / deprecated activities"
        onclick={() => {
          app.hideInactive = !app.hideInactive;
          app.persistUi();
        }}
      >
        <EyeOff class="size-3.5" /> Hide skipped
      </button>
      {#if app.activeFilterCount}
        <button class="text-xs text-rose-500 hover:underline" onclick={() => app.clearFilters()}>Reset</button>
      {/if}
    </div>
  </div>

  {#if open}
    <div class="space-y-2.5" transition:slide={{ duration: 180 }}>
      {#each visible as facet (facet.key)}
        <!-- Options without matches stay visible (dimmed) but move to the end. -->
        {@const all = [...app.facets[facet.key].filter((o) => o.count > 0), ...app.facets[facet.key].filter((o) => o.count === 0)]}
        {@const shown = expanded[facet.key] ? all : all.filter((o, i) => i < LIMIT || app.selected[facet.key].includes(o.value))}
        <div>
          <div class="text-muted mb-1 text-[11px] font-medium">{facet.label}</div>
          <div class="flex flex-wrap gap-1.5">
            {#each shown as opt (opt.value)}
              {@const on = app.selected[facet.key].includes(opt.value)}
              <button
                class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition active:scale-95 {on
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-[var(--border)] bg-white/35 hover:bg-white/70 dark:bg-white/5 dark:hover:bg-white/12'} {opt.count === 0 && !on ? 'opacity-45' : ''}"
                style={on ? `background:${opt.color}` : ''}
                onclick={() => app.toggleFacet(facet.key, opt.value)}
              >
                {#if !on}<span class="size-2 rounded-full" style="background:{opt.color}"></span>{/if}
                {opt.value}
                <span class="tabular-nums {on ? 'text-white/80' : 'text-muted'}">{opt.count}</span>
              </button>
            {/each}
            {#if all.length > LIMIT}
              <button
                class="rounded-full px-2 py-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                onclick={() => (expanded[facet.key] = !expanded[facet.key])}
              >
                {expanded[facet.key] ? 'Show less' : `+${all.length - shown.length} more`}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
