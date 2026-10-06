<script lang="ts">
  import { BedDouble, CalendarPlus, ChevronDown, ChevronUp, Columns3, X } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { daysBetween, formatDay, parseDate, stays } from '../airtable/itinerary';
  import DayCard from './DayCard.svelte';

  /** Day-by-day itinerary, rendered inside the sidebar / bottom sheet. Days are selected manually (click, ↑/↓). */

  const days = $derived(app.days);
  const tripStays = $derived(stays(days));
  const dated = $derived(days.filter((d) => d.date));
  const range = $derived.by(() => {
    if (!dated.length) return undefined;
    const first = parseDate(dated[0].date!);
    const last = parseDate(dated[dated.length - 1].date!);
    const fmt = (d: Date, year: boolean) =>
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
    return { text: `${fmt(first, false)} – ${fmt(last, true)}`, days: daysBetween(dated[0].date!, dated[dated.length - 1].date!) + 1 };
  });
  function gapBefore(i: number): number {
    if (i === 0) return 0;
    const a = days[i - 1].date;
    const b = days[i].date;
    return a && b ? daysBetween(a, b) - 1 : 0;
  }

  const activeIndex = $derived(days.findIndex((d) => d.id === app.activeDayId));
  const activeDay = $derived(activeIndex >= 0 ? days[activeIndex] : undefined);

  function onKey(e: KeyboardEvent) {
    if (app.showSettings || app.showMapping || app.lightbox || app.selectedActivity) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
    if (document.querySelector('[data-travel-popup]')) return; // Esc closes the popup first
    if (e.key === 'ArrowDown' || e.key === 'j') app.stepDay(1);
    else if (e.key === 'ArrowUp' || e.key === 'k') app.stepDay(-1);
    else if (e.key === 'Escape' && app.activeDayId) app.selectDay(null);
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet header()}
  <!-- Fixed overview (does not scroll): date range, all overnight stops, and day stepper -->
  <header class="shrink-0 space-y-2 border-b border-[var(--hairline)] px-4 pt-1 pb-2">
    {#if range}
      <div class="flex flex-wrap items-baseline gap-x-3">
        <div class="text-lg font-extrabold tracking-tight">{range.text}</div>
        <div class="text-muted text-xs">
          {range.days} days · {tripStays.length} stop{tripStays.length === 1 ? '' : 's'} · {days.reduce((n, d) => n + d.activityIds.length, 0)} activities planned
        </div>
      </div>
    {/if}

    {#if tripStays.length}
      <div class="flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {#each tripStays as s, i (s.firstDayId)}
          {@const active = !!app.activeDayId && s.dayIds.includes(app.activeDayId)}
          {#if i > 0}<span class="text-muted text-xs">→</span>{/if}
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition {active
              ? 'border-violet-500 bg-violet-500 text-white'
              : 'border-[var(--hairline)] bg-white/40 hover:bg-white/70 dark:bg-white/5'}"
            onclick={() => app.selectStay(s.dayIds, true)}
          >
            <BedDouble class="size-3.5" />
            <span class="font-semibold">{s.city}</span>
            <span class="opacity-70">{s.nights}n</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if days.length}
      <div class="flex items-center gap-1 text-xs">
        <button
          class="rounded-lg p-1 transition hover:bg-slate-500/10 disabled:opacity-30"
          title="Previous day (↑)"
          disabled={activeIndex === 0}
          onclick={() => app.stepDay(-1)}><ChevronUp class="size-4" /></button
        >
        <button
          class="rounded-lg p-1 transition hover:bg-slate-500/10 disabled:opacity-30"
          title="Next day (↓)"
          disabled={activeIndex === days.length - 1}
          onclick={() => app.stepDay(1)}><ChevronDown class="size-4" /></button
        >
        {#if activeDay}
          {@const f = formatDay(activeDay.date)}
          <span class="font-semibold">Day {app.dayNumber(activeDay)}</span>
          {#if f}<span class="text-muted">{f.weekday} {f.date}{activeDay.city ? ` · ${activeDay.city}` : ''}</span>{/if}
          <button class="text-muted ml-auto flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-slate-500/10" title="Show whole trip (Esc)" onclick={() => app.selectDay(null)}>
            <X class="size-3.5" /> Whole trip
          </button>
        {:else}
          <span class="text-muted">Select a day, or step through with ↑ / ↓</span>
        {/if}
      </div>
    {/if}
  </header>
{/snippet}

{#snippet dayList()}
  {#if !app.resolvedDays?.table}
    <div class="text-muted space-y-3 p-8 text-center text-sm">
      <CalendarPlus class="mx-auto size-10 opacity-50" />
      <p>No itinerary table found in this base.</p>
      <button class="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 font-medium text-white" onclick={() => (app.showMapping = true)}>
        <Columns3 class="size-4" /> Choose itinerary table
      </button>
    </div>
  {:else if !days.length}
    <div class="text-muted space-y-2 p-8 text-center text-sm">
      <CalendarPlus class="mx-auto size-10 opacity-50" />
      <p class="font-semibold text-[var(--text)]">No days planned yet</p>
      <p>
        Add one row per day to the <b>{app.resolvedDays.table.name}</b> table in Airtable: Date, Overnight city, Travel, linked
        Activities and Notes. Add Overnight Latitude/Longitude to draw the trip on the map.
      </p>
    </div>
  {:else}
    <!-- Bottom padding lets the last day scroll to the top. -->
    <div class="space-y-1 px-2 pb-[40vh]">
      {#each days as d, i (d.id)}
        {@const gap = gapBefore(i)}
        {#if gap > 0}
          <div class="text-muted pl-[4.25rem] text-xs italic">
            {gap} unplanned day{gap > 1 ? 's' : ''}
          </div>
        {/if}
        <DayCard day={d} number={app.dayNumber(d)} />
      {/each}
    </div>
  {/if}
{/snippet}

<!-- Only the day list scrolls; the overview stays on top with the panel's own background. -->
<div class="flex min-h-0 flex-1 flex-col">
  {#if range || tripStays.length || days.length}{@render header()}{/if}
  <div class="scroll-thin min-h-0 flex-1 overflow-y-auto pt-2">
    {@render dayList()}
  </div>
</div>
