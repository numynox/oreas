<script lang="ts">
  import { ImageOff } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { images, type Variant } from '../images.svelte';
  import type { AirtableAttachment } from '../airtable/types';

  interface Props {
    att?: AirtableAttachment;
    variant?: Variant;
    alt?: string;
    class?: string;
    eager?: boolean;
  }
  let { att, variant = 'large', alt = '', class: cls = '', eager = false }: Props = $props();
  // Stored blob (offline) if available, otherwise the signed Airtable URL.
  const src = $derived(att ? images.url(att, variant) : undefined);
  let loaded = $state(false);
  let failed = $state(false);

  $effect(() => {
    void src;
    loaded = false;
    failed = false;
  });
</script>

<div class="relative overflow-hidden bg-slate-200 dark:bg-slate-800 {cls}">
  {#if src && !failed}
    <img
      {src}
      {alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerpolicy="no-referrer"
      class="img-fade h-full w-full object-cover {loaded ? 'loaded' : ''}"
      onload={() => (loaded = true)}
      onerror={() => {
        failed = true;
        app.reportImageError();
      }}
    />
  {:else}
    <div class="text-muted flex h-full w-full items-center justify-center">
      <ImageOff class="size-5 opacity-60" />
    </div>
  {/if}
</div>
