<script lang="ts">
  import { ChevronLeft, ChevronRight, LoaderCircle, X } from '@lucide/svelte';
  import { fade, scale } from 'svelte/transition';
  import { app } from '../state.svelte';
  import { images } from '../images.svelte';

  const lb = $derived(app.lightbox!);
  const att = $derived(lb.images[lb.index]);

  // Progressive: show the (usually stored) large thumbnail immediately, then swap in the original.
  // Opening an original stores it for offline use.
  let fullUrl = $state<string | undefined>();
  let loadingFull = $state(false);
  let failed = $state(false);
  const src = $derived(fullUrl ?? images.url(att, 'large'));

  $effect(() => {
    const current = att;
    fullUrl = images.storedUrl(current, 'full');
    failed = false;
    if (fullUrl) return;
    loadingFull = true;
    const p = images.has(current.id, 'full') ? images.load(current, 'full') : app.online ? images.fetch(current, 'full') : Promise.resolve(undefined);
    p.then((u) => {
      if (current === att && u) fullUrl = u;
    }).finally(() => {
      if (current === att) loadingFull = false;
      void app.refreshStorage();
    });
  });

  function go(d: number) {
    const n = lb.images.length;
    app.lightbox = { ...lb, index: (lb.index + d + n) % n };
  }
  function close() {
    app.lightbox = null;
  }

  let startX = 0;
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  }}
/>

<div
  class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/92 backdrop-blur"
  transition:fade={{ duration: 180 }}
  role="presentation"
  onclick={(e) => e.target === e.currentTarget && close()}
  onpointerdown={(e) => (startX = e.clientX)}
  onpointerup={(e) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  }}
>
  {#key att.id}
    {#if failed}
      <div class="text-sm text-white/70">
        {app.online ? 'Image could not be loaded – sync to refresh the links.' : 'This image is not available offline.'}
      </div>
    {:else}
      <img
        {src}
        alt={att.filename}
        referrerpolicy="no-referrer"
        class="max-h-[88dvh] max-w-[94vw] rounded-xl object-contain shadow-2xl select-none"
        draggable="false"
        in:scale={{ start: 0.96, duration: 200 }}
        onerror={() => {
          failed = true;
          app.reportImageError();
        }}
      />
    {/if}
  {/key}

  <div class="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 text-white">
    <span class="flex min-w-0 items-center gap-2 text-sm opacity-80">
      <span class="truncate">{att.filename} · {lb.index + 1}/{lb.images.length}</span>
      {#if loadingFull && !fullUrl}<LoaderCircle class="size-4 shrink-0 animate-spin" />{/if}
    </span>
    <button class="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Close" onclick={close}><X class="size-5" /></button>
  </div>
  {#if lb.images.length > 1}
    <button class="absolute left-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Previous" onclick={() => go(-1)}>
      <ChevronLeft class="size-6" />
    </button>
    <button class="absolute right-3 rounded-full bg-white/10 p-3 text-white hover:bg-white/20" aria-label="Next" onclick={() => go(1)}>
      <ChevronRight class="size-6" />
    </button>
  {/if}
</div>
