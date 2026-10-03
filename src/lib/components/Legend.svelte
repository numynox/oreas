<script lang="ts">
  import { FACETS, app } from '../state.svelte';

  const label = $derived(FACETS.find((f) => f.key === app.colorBy)?.label ?? '');
  const items = $derived((app.facets[app.colorBy] ?? []).filter((o) => o.count > 0));
</script>

{#if items.length}
  <div class="glass max-w-[60vw] rounded-2xl px-3 py-2 text-xs">
    <div class="text-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">{label}</div>
    <div class="flex flex-wrap gap-x-3 gap-y-1">
      {#each items as o (o.value)}
        <button class="flex items-center gap-1.5 hover:underline" onclick={() => app.toggleFacet(app.colorBy, o.value)}>
          <span class="size-2.5 rounded-full ring-2 ring-white/70" style="background:{o.color}"></span>{o.value}
        </button>
      {/each}
    </div>
  </div>
{/if}
