<script lang="ts">
  import { X } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    title: string;
    onclose?: () => void;
    children: Snippet;
    footer?: Snippet;
    wide?: boolean;
  }
  let { title, onclose, children, footer, wide = false }: Props = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose?.()} />

<div class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
  <button
    class="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-sm"
    aria-label="Close"
    transition:fade={{ duration: 150 }}
    onclick={() => onclose?.()}
  ></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    class="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl glass-strong sm:rounded-3xl {wide
      ? 'sm:max-w-2xl'
      : 'sm:max-w-lg'}"
    transition:fly={{ y: 30, duration: 220 }}
  >
    <header class="flex items-center justify-between gap-4 border-b border-[var(--hairline)] px-6 py-4">
      <h2 class="text-lg font-semibold">{title}</h2>
      {#if onclose}
        <button class="rounded-full p-1.5 hover:bg-slate-500/10" aria-label="Close" onclick={onclose}>
          <X class="size-5" />
        </button>
      {/if}
    </header>
    <div class="scroll-thin overflow-y-auto px-6 py-5">
      {@render children()}
    </div>
    {#if footer}
      <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--hairline)] px-6 py-4">
        {@render footer()}
      </footer>
    {/if}
  </div>
</div>
