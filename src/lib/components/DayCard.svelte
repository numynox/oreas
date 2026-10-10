<script lang="ts">
  import { BedDouble, Camera, ChevronRight, MapPinOff, StickyNote } from '@lucide/svelte';
  import { slide } from 'svelte/transition';
  import { app } from '../state.svelte';
  import { parseDate, type Day } from '../airtable/itinerary';
  import { formatDuration } from '../airtable/activities';
  import Img from './Img.svelte';
  import TypeIcon from './TypeIcon.svelte';
  import TravelInfo from './TravelInfo.svelte';

  let { day, number }: { day: Day; number: number } = $props();

  const when = $derived.by(() => {
    if (!day.date) return undefined;
    const d = parseDate(day.date);
    const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o);
    return { weekday: part({ weekday: 'short' }), day: d.getDate(), month: part({ month: 'short' }) };
  });
  const active = $derived(app.activeDayId === day.id);
  const today = $derived(app.todayDayId === day.id);
  const acts = $derived(day.activityIds.map((id) => app.activities.find((a) => a.id === id)).filter((a) => !!a));
  const missing = $derived(day.activityIds.length - acts.length);

  /** Collapsible text sections (collapsed by default). */
  const sections = $derived(
    [
      { key: 'notes', label: 'Notes', icon: StickyNote, text: day.notes },
      { key: 'photos', label: 'Photo spots', icon: Camera, text: day.photoSpots },
    ].filter((x) => x.text),
  );
  let open = $state<Record<string, boolean>>({});
</script>

<!-- Compact day row: date column + header line (title, travel, overnight) + activity grid + collapsible notes / photo spots. -->
<div
  data-day={day.id}
  role="button"
  tabindex="0"
  class="flex scroll-mt-3 gap-3 rounded-2xl border px-2.5 py-2 transition {active
    ? 'border-violet-400/60 bg-white/55 shadow-lg shadow-violet-500/10 dark:bg-white/8'
    : today
      ? 'border-emerald-500/50 bg-emerald-500/5 hover:bg-white/35 dark:hover:bg-white/5'
      : 'border-transparent hover:bg-white/35 dark:hover:bg-white/5'}"
  aria-current={today ? 'date' : undefined}
  onclick={() => app.selectDay(active ? null : day.id)}
  onkeydown={(e) => e.key === 'Enter' && app.selectDay(active ? null : day.id)}
>
  <div class="flex w-12 shrink-0 flex-col items-center gap-0.5 self-start">
    <div
      class="flex w-full flex-col items-center justify-center rounded-xl py-1 text-white shadow-sm transition {active
        ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
        : today
          ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
          : 'bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700'} {today && active
        ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-transparent'
        : ''}"
    >
      {#if when}
        <span class="text-[9px] leading-tight font-semibold uppercase opacity-80">{when.weekday}</span>
        <span class="text-base leading-none font-extrabold">{when.day}</span>
        <span class="text-[9px] leading-tight font-medium opacity-90">{when.month}</span>
      {:else}
        <span class="py-1 text-[9px] leading-tight font-semibold opacity-90">No date</span>
      {/if}
    </div>
    {#if today}
      <span class="text-[10px] leading-tight font-bold text-emerald-600 dark:text-emerald-400">Today</span>
    {:else}
      <span class="text-muted text-[10px] leading-tight">Day {number}</span>
    {/if}
  </div>

  <div class="min-w-0 flex-1 space-y-1.5">
    <header class="flex min-w-0 items-center gap-2 text-sm">
      {#if day.title}<span class="min-w-0 truncate font-bold">{day.title}</span>{/if}
      {#if day.travel || day.travelDetails}
        <span class="ml-auto flex min-w-0 shrink"><TravelInfo travel={day.travel} details={day.travelDetails} /></span>
      {/if}
      {#if day.city || day.accommodation}
        <span class="{day.travel || day.travelDetails ? '' : 'ml-auto'} flex max-w-[45%] shrink-0 items-center gap-1 text-xs" title={[day.city, day.accommodation].filter(Boolean).join(' · ')}>
          <BedDouble class="size-3.5 shrink-0 text-violet-500" />
          <span class="truncate"><b class="font-semibold">{day.city ?? 'Overnight'}</b>{#if day.accommodation}<span class="text-muted"> · {day.accommodation}</span>{/if}</span>
        </span>
      {/if}
    </header>

    {#if acts.length || missing}
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(max(150px,calc((100%-0.5rem)/3)),1fr))] gap-1">
        {#each acts as a (a.id)}
          <li class="min-w-0">
            <button
              class="group flex w-full items-center gap-2 rounded-xl bg-white/30 p-1 pr-2 text-left transition hover:bg-white/70 dark:bg-white/4 dark:hover:bg-white/10 {app.hoveredId === a.id
                ? 'bg-white/70 dark:bg-white/10'
                : ''}"
              title={a.name}
              onclick={(e) => {
                e.stopPropagation();
                if (!app.activeStayDayIds?.includes(day.id)) app.activeStayDayIds = null;
                app.activeDayId = day.id;
                app.selectedId = a.id;
              }}
              onmouseenter={() => (app.hoveredId = a.id)}
              onmouseleave={() => (app.hoveredId = null)}
            >
              <div class="relative shrink-0">
                <Img att={a.images[0]} alt={a.name} class="size-8 rounded-lg" />
                <span
                  class="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full text-white ring-1 ring-white/80 dark:ring-slate-800"
                  style="background:{app.colorOf(a)}"
                >
                  <TypeIcon type={a.type} class="size-2.5" />
                </span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-xs leading-tight font-semibold group-hover:text-violet-600 dark:group-hover:text-violet-400">{a.name}</div>
                <div class="text-muted flex items-center gap-1.5 truncate text-[10px] leading-tight">
                  {#if a.durationSec}<span>{formatDuration(a.durationSec)}</span>{/if}
                  {#if a.priority}<span>{a.priority}</span>{/if}
                  {#if a.lat === undefined}<span class="flex items-center gap-0.5 text-amber-600"><MapPinOff class="size-2.5" />unplaced</span>{/if}
                </div>
              </div>
            </button>
          </li>
        {/each}
        {#if missing}
          <li class="text-muted self-center pl-1 text-xs">+{missing} linked activit{missing === 1 ? 'y' : 'ies'} not found</li>
        {/if}
      </ul>
    {/if}

    {#each sections as sec (sec.key)}
      <div>
        <button
          class="text-muted flex w-full min-w-0 items-center gap-1.5 rounded-lg py-0.5 text-left text-xs transition hover:text-[var(--text)]"
          aria-expanded={!!open[sec.key]}
          onclick={(e) => {
            e.stopPropagation();
            open[sec.key] = !open[sec.key];
          }}
        >
          <ChevronRight class="size-3.5 shrink-0 transition-transform {open[sec.key] ? 'rotate-90' : ''}" />
          <sec.icon class="size-3.5 shrink-0" />
          <span class="shrink-0 font-semibold">{sec.label}</span>
          {#if !open[sec.key]}<span class="min-w-0 truncate opacity-80">{sec.text}</span>{/if}
        </button>
        {#if open[sec.key]}
          <p
            class="mt-1 ml-5 rounded-xl bg-white/30 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line dark:bg-white/5"
            transition:slide={{ duration: 180 }}
          >{sec.text}</p>
        {/if}
      </div>
    {/each}
  </div>
</div>
