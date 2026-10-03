<script lang="ts">
  import { Bus, CalendarDays, Car, CarFront, Banknote, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, MapPinOff, Navigation, Ticket, X } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { formatCost, formatDuration, type Activity } from '../airtable/activities';
  import Img from './Img.svelte';
  import TypeIcon from './TypeIcon.svelte';
  import RatingPanel from './RatingPanel.svelte';
  import { formatDay } from '../airtable/itinerary';

  let { activity: a }: { activity: Activity } = $props();

  let scroller: HTMLDivElement | undefined = $state();
  let slide = $state(0);
  $effect(() => {
    void a.id;
    slide = 0;
    scroller?.scrollTo({ left: 0 });
  });

  function go(d: number) {
    if (!scroller) return;
    const n = Math.max(0, Math.min(a.images.length - 1, slide + d));
    scroller.scrollTo({ left: n * scroller.clientWidth, behavior: 'smooth' });
  }

  function chipColor(key: 'type' | 'status' | 'priority' | 'access', value: string) {
    return app.facets[key]?.find((o) => o.value === value)?.color ?? '#94a3b8';
  }

  const fields = $derived(app.resolved?.fields ?? {});
  const facts = $derived(
    [
      { icon: Clock, label: 'Duration', value: formatDuration(a.durationSec), show: !!fields.duration },
      { icon: Banknote, label: 'Cost / person', value: formatCost(a.cost, fields.cost), show: !!fields.cost },
      { icon: Ticket, label: 'Booking', value: a.booking ? 'Required' : 'Not needed', show: !!fields.booking },
      {
        icon: /car only/i.test(a.access ?? '') ? Car : /car/i.test(a.access ?? '') ? CarFront : Bus,
        label: 'Access by',
        value: a.access,
        show: !!fields.access,
        color: a.access ? chipColor('access', a.access) : undefined,
      },
    ].filter((f) => f.show && f.value) as { icon: typeof Clock; label: string; value: string; color?: string }[],
  );
  const scheduledOn = $derived(app.scheduled.get(a.id) ?? []);
  const mapsUrl = $derived(
    a.lat !== undefined
      ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.name, a.location, a.region].filter(Boolean).join(', '))}`,
  );
</script>

<div class="flex h-full flex-col">
  <!-- Images -->
  <div class="relative shrink-0">
    {#if a.images.length}
      <div
        bind:this={scroller}
        class="flex h-56 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] sm:h-64"
        onscroll={(e) => (slide = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {#each a.images as img, i (img.id)}
          <button
            class="h-full w-full shrink-0 snap-center"
            aria-label="Open image {i + 1}"
            onclick={() => (app.lightbox = { images: a.images, index: i })}
          >
            <Img att={img} alt={img.filename} class="h-full w-full" eager={i === 0} />
          </button>
        {/each}
      </div>
      {#if a.images.length > 1}
        <button class="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur hover:bg-black/55 disabled:opacity-0" disabled={slide === 0} onclick={() => go(-1)} aria-label="Previous image">
          <ChevronLeft class="size-4" />
        </button>
        <button class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur hover:bg-black/55 disabled:opacity-0" disabled={slide === a.images.length - 1} onclick={() => go(1)} aria-label="Next image">
          <ChevronRight class="size-4" />
        </button>
        <div class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
          {#each a.images as img, i (img.id)}
            <span class="h-1.5 rounded-full bg-white shadow transition-all {i === slide ? 'w-4' : 'w-1.5 opacity-60'}"></span>
          {/each}
        </div>
      {/if}
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent"></div>
    {:else}
      <div class="flex h-28 items-center justify-center text-white" style="background:linear-gradient(135deg,{app.colorOf(a)},#8b5cf6)">
        <TypeIcon type={a.type} class="size-10 opacity-80" />
      </div>
    {/if}
    <button
      class="absolute top-3 right-3 rounded-full bg-black/40 p-1.5 text-white backdrop-blur transition hover:bg-black/60"
      aria-label="Close details"
      onclick={() => (app.selectedId = null)}
    >
      <X class="size-4" />
    </button>
  </div>

  <!-- Body -->
  <div class="scroll-thin flex-1 space-y-5 overflow-y-auto p-5">
    <div>
      <div class="mb-2 flex flex-wrap gap-1.5">
        {#if a.type}
          <span class="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style="background:{chipColor('type', a.type)}">
            <TypeIcon type={a.type} class="size-3" />{a.type}
          </span>
        {/if}
        {#if a.status}
          <span class="rounded-full border px-2.5 py-0.5 text-xs font-medium" style="border-color:{chipColor('status', a.status)};color:{chipColor('status', a.status)}">
            {a.status}
          </span>
        {/if}
        {#if a.priority}
          <span class="rounded-full border px-2.5 py-0.5 text-xs font-medium" style="border-color:{chipColor('priority', a.priority)};color:{chipColor('priority', a.priority)}">
            {a.priority} priority
          </span>
        {/if}
      </div>
      <h2 class="text-2xl leading-tight font-bold tracking-tight">{a.name}</h2>
      {#if a.location || a.region}
        <p class="text-muted mt-1 flex items-start gap-1.5 text-sm">
          <MapPin class="mt-0.5 size-4 shrink-0" />
          <span>{[a.location, a.region].filter(Boolean).join(' · ')}</span>
        </p>
      {/if}
      {#if a.lat === undefined}
        <p class="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/12 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <MapPinOff class="size-3.5" /> No coordinates yet – add Latitude/Longitude in Airtable to place it on the map.
        </p>
      {/if}
    </div>

    {#if facts.length}
      <div class="grid gap-2 {facts.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}">
        {#each facts as f (f.label)}
          <div class="rounded-2xl bg-slate-500/8 p-3">
            <f.icon class="mb-1 size-4 {f.color ? '' : 'text-muted'}" style={f.color ? `color:${f.color}` : ''} />
            <div class="text-sm font-semibold">{f.value}</div>
            <div class="text-muted text-[11px]">{f.label}</div>
          </div>
        {/each}
      </div>
    {/if}


    {#if scheduledOn.length}
      <div>
        <div class="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">In the itinerary</div>
        <div class="flex flex-wrap gap-1.5">
          {#each scheduledOn as d (d.id)}
            {@const f = formatDay(d.date)}
            <button
              class="flex items-center gap-1.5 rounded-full bg-violet-500/12 px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300"
              onclick={() => app.showDay(d.id)}
            >
              <CalendarDays class="size-3.5" /> Day {app.dayNumber(d)}{f ? ` · ${f.weekday} ${f.date}` : ''}{d.city ? ` · ${d.city}` : ''}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if a.notes}
      <div>
        <div class="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Notes</div>
        <p class="text-sm leading-relaxed whitespace-pre-line">{a.notes}</p>
      </div>
    {/if}

    <div class="flex flex-wrap gap-2 pt-1">
      {#if a.url}
        <a href={a.url} target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 active:scale-[.98]">
          <ExternalLink class="size-4" /> Website
        </a>
      {/if}
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3.5 py-2 text-sm font-medium transition hover:bg-slate-500/10 active:scale-[.98]">
        <Navigation class="size-4" /> Google Maps
      </a>
    </div>
  </div>
  {#if app.rating && app.ratingCurrentId === a.id}
    <div class="shrink-0"><RatingPanel /></div>
  {/if}
</div>
