<script lang="ts">
  import { CalendarDays, Compass } from '@lucide/svelte';
  import { app, type Mode } from '../state.svelte';

  let { compact = false }: { compact?: boolean } = $props();
  const items: { mode: Mode; label: string; icon: typeof Compass }[] = [
    { mode: 'explore', label: 'Explore', icon: Compass },
    { mode: 'itinerary', label: 'Itinerary', icon: CalendarDays },
  ];
  const idx = $derived(items.findIndex((i) => i.mode === app.mode));
</script>

<div class="relative grid grid-cols-2 rounded-2xl bg-slate-500/12 p-1 {compact ? 'glass' : ''}" role="tablist" aria-label="Switch view">
  <span
    class="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out dark:bg-slate-700"
    style="transform:translateX({idx * 100}%)"
  ></span>
  {#each items as it (it.mode)}
    <button
      role="tab"
      aria-selected={app.mode === it.mode}
      class="relative z-10 flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition {app.mode === it.mode
        ? 'text-violet-700 dark:text-violet-300'
        : 'text-muted hover:text-[var(--text)]'}"
      onclick={() => app.setMode(it.mode)}
    >
      <it.icon class="size-4" />
      <span class={compact ? 'hidden sm:inline' : ''}>{it.label}</span>
      {#if it.mode === 'itinerary' && app.days.length}
        <span class="rounded-full bg-violet-500/15 px-1.5 text-[10px] tabular-nums">{app.days.length}</span>
      {/if}
    </button>
  {/each}
</div>
