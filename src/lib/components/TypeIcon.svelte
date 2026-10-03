<script lang="ts">
  import { Bath, Building, Landmark, MapPin, Mountain, UtensilsCrossed } from '@lucide/svelte';

  let { type, class: cls = 'size-4' }: { type?: string; class?: string } = $props();

  const Icon = $derived.by(() => {
    const t = (type ?? '').toLowerCase();
    if (/hike|trail|walk|nature|mountain/.test(t)) return Mountain;
    if (/food|eat|restaurant|market/.test(t)) return UtensilsCrossed;
    if (/museum|art|gallery/.test(t)) return Landmark;
    if (/onsen|bath|spa/.test(t)) return Bath;
    if (/city|town|district/.test(t)) return Building;
    return MapPin;
  });
</script>

<Icon class={cls} />
