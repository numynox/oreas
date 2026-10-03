<script lang="ts">
  import { Check, Layers } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { app } from '../state.svelte';
  import { MAP_STYLES, getStyle, type StyleId } from '../mapStyles';

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  const current = $derived(getStyle(app.mapStyle));

  function pick(id: StyleId) {
    app.mapStyle = id;
    app.persistUi();
    open = false;
  }
</script>

<svelte:window
  onpointerdown={(e) => open && root && !root.contains(e.target as Node) && (open = false)}
  onkeydown={(e) => e.key === 'Escape' && (open = false)}
/>

<div class="relative" bind:this={root}>
  <button
    class="glass flex items-center gap-1.5 rounded-2xl px-2.5 py-2 text-xs font-medium transition hover:brightness-105 {open ? 'ring-2 ring-violet-500/60' : ''}"
    title="Map style"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="size-4 rounded-md ring-1 ring-black/10" style="background:{current.swatch(app.dark)}"></span>
    <Layers class="text-muted size-4 lg:hidden" />
    <span class="hidden lg:inline">{current.label}</span>
  </button>

  {#if open}
    <div
      class="glass absolute top-full right-0 z-30 mt-2 w-[340px] rounded-3xl p-2 max-lg:fixed max-lg:top-[112px] max-lg:right-3 max-lg:left-3 max-lg:mt-0 max-lg:w-auto"
      transition:fly={{ y: -6, duration: 160 }}
    >
      <div class="text-muted px-2 pt-1 pb-2 text-[10px] font-semibold tracking-wide uppercase">Map style</div>
      <div class="grid grid-cols-2 gap-1.5">
        {#each MAP_STYLES as s (s.id)}
          {@const active = s.id === app.mapStyle}
          <button
            class="group flex flex-col gap-1.5 rounded-2xl p-1.5 text-left transition {active
              ? 'bg-violet-500/15 ring-2 ring-violet-500/70'
              : 'hover:bg-white/40 dark:hover:bg-white/8'}"
            title={s.description}
            onclick={() => pick(s.id)}
          >
            <span
              class="relative h-14 w-full overflow-hidden rounded-xl ring-1 ring-black/10 transition group-hover:scale-[1.02]"
              style="background:{s.swatch(app.dark)}"
            >
              {#if active}
                <span class="absolute top-1.5 right-1.5 rounded-full bg-violet-600 p-0.5 text-white shadow"><Check class="size-3" /></span>
              {/if}
            </span>
            <span class="px-0.5">
              <span class="block text-xs font-semibold">{s.label}</span>
              <span class="text-muted line-clamp-2 block text-[10px] leading-snug">{s.description}</span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
