<script lang="ts">
  import { BedDouble, CalendarPlus, Columns3 } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { daysBetween, parseDate, scrollToDay, stays } from '../airtable/itinerary';
  import DayCard from './DayCard.svelte';

  /** Day-by-day itinerary, rendered inside the sidebar / bottom sheet (whose scroll container drives the scroll-spy). */
  let root: HTMLDivElement | undefined = $state();

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
  /** Day numbers count from the first date, so gaps keep the numbering honest. */
  function dayNumber(i: number): number {
    const d = days[i];
    return d.date && dated.length ? daysBetween(dated[0].date!, d.date) + 1 : i + 1;
  }
  function gapBefore(i: number): number {
    if (i === 0) return 0;
    const a = days[i - 1].date;
    const b = days[i].date;
    return a && b ? daysBetween(a, b) - 1 : 0;
  }

  // Scroll-spy: the topmost visible day becomes the active one (drives the map).
  $effect(() => {
    const list = root?.closest<HTMLElement>('.overflow-y-auto');
    if (!root || !list || !days.length) return;
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.day!;
          if (e.isIntersecting) seen.set(id, e.boundingClientRect.top);
          else seen.delete(id);
        }
        if (Date.now() < app.spyPausedUntil) return;
        const top = [...seen.entries()].sort((x, y) => x[1] - y[1])[0];
        if (top && top[0] !== app.activeDayId) app.activeDayId = top[0];
      },
      { root: list, rootMargin: '0px 0px -55% 0px', threshold: 0 },
    );
    for (const el of root.querySelectorAll('[data-day]')) io.observe(el);
    return () => io.disconnect();
  });

  function jump(dayId: string) {
    app.activeDayId = dayId;
    app.spyPausedUntil = Date.now() + 1200;
    scrollToDay(dayId);
  }
</script>

{#snippet header()}
  <header class="space-y-3 px-5 pt-2 pb-4">
    {#if range}
      <div>
        <div class="text-2xl font-extrabold tracking-tight">{range.text}</div>
        <div class="text-muted text-sm">
          {range.days} days · {tripStays.length} stop{tripStays.length === 1 ? '' : 's'} · {days.reduce((n, d) => n + d.activityIds.length, 0)} activities planned
        </div>
      </div>
    {/if}

    {#if tripStays.length}
      <div class="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {#each tripStays as s, i (s.firstDayId)}
          {@const active = !!app.activeDayId && s.dayIds.includes(app.activeDayId)}
          {#if i > 0}<span class="text-muted self-center text-xs">→</span>{/if}
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition {active
              ? 'border-violet-500 bg-violet-500 text-white'
              : 'border-[var(--hairline)] bg-white/40 hover:bg-white/70 dark:bg-white/5'}"
            onclick={() => jump(s.firstDayId)}
          >
            <BedDouble class="size-3.5" />
            <span class="font-semibold">{s.city}</span>
            <span class="opacity-70">{s.nights}n</span>
          </button>
        {/each}
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
    <div class="relative space-y-4 px-4 pb-[40vh]">
      <!-- timeline rail -->
      <div class="absolute top-6 bottom-8 left-[37px] w-0.5 rounded-full bg-gradient-to-b from-violet-400/60 via-fuchsia-400/40 to-transparent"></div>
      {#each days as d, i (d.id)}
        {@const gap = gapBefore(i)}
        {#if gap > 0}
          <div class="text-muted relative pl-14 text-xs italic">
            {gap} unplanned day{gap > 1 ? 's' : ''}
          </div>
        {/if}
        <DayCard day={d} number={dayNumber(i)} />
      {/each}
    </div>
  {/if}
{/snippet}

<div bind:this={root}>
  {#if range || tripStays.length}{@render header()}{/if}
  {@render dayList()}
</div>
