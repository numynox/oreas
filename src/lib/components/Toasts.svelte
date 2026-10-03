<script lang="ts">
  import { CircleAlert, CircleCheck, Info, X } from '@lucide/svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { app } from '../state.svelte';
</script>

<div class="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
  {#each app.toasts as t (t.id)}
    <div
      animate:flip={{ duration: 200 }}
      transition:fly={{ y: 20, duration: 220 }}
      class="glass pointer-events-auto flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm"
    >
      {#if t.kind === 'error'}<CircleAlert class="mt-px size-4 shrink-0 text-rose-500" />
      {:else if t.kind === 'success'}<CircleCheck class="mt-px size-4 shrink-0 text-emerald-500" />
      {:else}<Info class="mt-px size-4 shrink-0 text-violet-500" />{/if}
      <div class="flex-1">{t.message}</div>
      {#if t.action}
        <button
          class="shrink-0 font-semibold text-violet-600 hover:underline dark:text-violet-400"
          onclick={() => {
            t.action!.run();
            app.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="text-muted shrink-0" aria-label="Dismiss" onclick={() => app.dismiss(t.id)}><X class="size-4" /></button>
    </div>
  {/each}
</div>
