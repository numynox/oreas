<script lang="ts">
  import { MapPinOff, Ticket } from '@lucide/svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import { app } from '../state.svelte';
  import Img from './Img.svelte';
  import TypeIcon from './TypeIcon.svelte';

  const sorted = $derived(
    [...app.filtered].sort((a, b) => {
      const p = Number(b.lat !== undefined) - Number(a.lat !== undefined);
      if (p) return p;
      return a.name.localeCompare(b.name);
    }),
  );
  const unplaced = $derived(app.filtered.filter((a) => a.lat === undefined).length);

  // Scroll the selected item into view.
  let listEl: HTMLDivElement | undefined = $state();
  $effect(() => {
    const id = app.selectedId;
    if (!id || !listEl) return;
    // Scroll only the list's own scroll container (scrollIntoView would also scroll the clipped page).
    const item = listEl.querySelector<HTMLElement>(`[data-id="${id}"]`);
    const scroller = listEl.closest<HTMLElement>('.overflow-y-auto');
    if (!item || !scroller) return;
    const i = item.getBoundingClientRect();
    const c = scroller.getBoundingClientRect();
    if (i.top < c.top) scroller.scrollBy({ top: i.top - c.top - 8, behavior: 'smooth' });
    else if (i.bottom > c.bottom) scroller.scrollBy({ top: i.bottom - c.bottom + 8, behavior: 'smooth' });
  });
</script>

<div class="text-muted mb-2 flex items-center justify-between text-xs">
  <span><b class="text-[var(--text)]">{app.filtered.length}</b> of {app.activities.length} activities</span>
  {#if unplaced}
    <span class="flex items-center gap-1"><MapPinOff class="size-3.5" />{unplaced} unplaced</span>
  {/if}
</div>

<div bind:this={listEl} class="space-y-1.5">
  {#each sorted as a (a.id)}
    {@const active = a.id === app.selectedId}
    <button
      data-id={a.id}
      animate:flip={{ duration: 250 }}
      in:fade={{ duration: 150 }}
      class="group flex w-full items-center gap-3 rounded-2xl p-1.5 pr-3 text-left transition {active
        ? 'bg-violet-500/12 ring-2 ring-violet-500/60'
        : 'hover:bg-slate-500/8'}"
      onclick={() => (app.selectedId = active ? null : a.id)}
      onmouseenter={() => (app.hoveredId = a.id)}
      onmouseleave={() => (app.hoveredId = null)}
    >
      <div class="relative shrink-0">
        <Img att={a.images[0]} alt={a.name} class="size-14 rounded-xl" />
        <span
          class="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full text-white ring-2 ring-[var(--surface-solid)]"
          style="background:{app.colorOf(a)}"
        >
          <TypeIcon type={a.type} class="size-3.5" />
        </span>
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-semibold transition group-hover:text-violet-600 dark:group-hover:text-violet-400">
          {a.name}
        </div>
        <div class="text-muted truncate text-xs">{[a.region, a.type].filter(Boolean).join(' · ') || '—'}</div>
        <div class="mt-1 flex flex-wrap gap-1">
          {#if a.lat === undefined}
            <span class="flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <MapPinOff class="size-2.5" /> Unplaced
            </span>
          {/if}
          {#if a.status}
            <span class="rounded-md bg-slate-500/10 px-1.5 py-px text-[10px] font-medium">{a.status}</span>
          {/if}
          {#if app.scheduled.get(a.id)?.length}
            {@const d = app.scheduled.get(a.id)![0]}
            <span class="rounded-md bg-violet-500/12 px-1.5 py-px text-[10px] font-medium text-violet-700 dark:text-violet-300">
              Day {app.dayNumber(d)}
            </span>
          {/if}
          {#if a.booking}
            <span class="flex items-center gap-0.5 rounded-md bg-rose-500/12 px-1.5 py-px text-[10px] font-medium text-rose-600 dark:text-rose-400">
              <Ticket class="size-2.5" /> Booking
            </span>
          {/if}
        </div>
      </div>
    </button>
  {:else}
    <div class="text-muted py-10 text-center text-sm">
      {#if app.activities.length}
        No activities match your filters.
        <button class="mt-2 block w-full text-violet-500 hover:underline" onclick={() => app.clearFilters()}>Reset filters</button>
      {:else if app.syncing}
        Loading activities…
      {:else}
        No data yet.
      {/if}
    </div>
  {/each}
</div>
