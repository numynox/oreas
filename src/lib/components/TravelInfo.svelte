<script lang="ts">
  import { TrainFront, X } from '@lucide/svelte';
  import { fade } from 'svelte/transition';
  import { portal } from '../portal';

  /** Short travel label as a chip; the long "Travel details" open in a popup. Without a label, only the train icon is shown. */
  let { travel, details }: { travel?: string; details?: string } = $props();

  let trigger: HTMLButtonElement | undefined = $state();
  let pos = $state<{ left: number; top?: number; bottom?: number } | null>(null);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (pos || !trigger || !details) {
      pos = null;
      return;
    }
    // Fixed positioning so the popup is never clipped by the scrolling list.
    const r = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 360 - 8));
    pos = r.bottom + 220 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 };
  }
  const close = () => (pos = null);

  // Close when anything scrolls (the list's scroll events don't bubble, so listen in the capture phase).
  $effect(() => {
    if (!pos) return;
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  });
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && close()}
  onpointerdown={(e) => pos && !(e.target as Element).closest?.('[data-travel-popup]') && e.target !== trigger && !trigger?.contains(e.target as Node) && close()}
  onresize={close}
/>

{#if travel}
  <button
    bind:this={trigger}
    class="flex min-w-0 shrink items-center gap-1 truncate rounded-full bg-sky-500/12 px-2 py-0.5 text-xs text-sky-900 transition dark:text-sky-200 {details
      ? 'cursor-pointer hover:bg-sky-500/22'
      : 'cursor-default'}"
    title={details ? 'Show travel details' : travel}
    aria-expanded={!!pos}
    onclick={toggle}
  >
    <TrainFront class="size-3 shrink-0" /><span class="truncate">{travel}</span>
  </button>
{:else if details}
  <button
    bind:this={trigger}
    class="flex shrink-0 items-center rounded-full bg-sky-500/12 px-2 py-0.5 text-sky-900 transition hover:bg-sky-500/22 dark:text-sky-200"
    title="Show travel details"
    aria-label="Show travel details"
    aria-expanded={!!pos}
    onclick={toggle}
  >
    <TrainFront class="size-3" />
  </button>
{/if}

{#if pos && details}
  <div
    use:portal
    data-travel-popup
    role="dialog"
    aria-label="Travel details"
    class="glass-strong fixed z-[70] w-[360px] max-w-[calc(100vw-16px)] rounded-2xl p-3 text-sm"
    style="left:{pos.left}px;{pos.top !== undefined ? `top:${pos.top}px` : `bottom:${pos.bottom}px`}"
    transition:fade={{ duration: 120 }}
  >
    <div class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-sky-700 uppercase dark:text-sky-300">
      <TrainFront class="size-3.5" /> Travel
      <button class="text-muted ml-auto rounded-full p-0.5 hover:bg-slate-500/10" aria-label="Close" onclick={close}><X class="size-3.5" /></button>
    </div>
    {#if travel}<div class="mb-1 font-semibold">{travel}</div>{/if}
    <p class="leading-relaxed whitespace-pre-line">{details}</p>
  </div>
{/if}
