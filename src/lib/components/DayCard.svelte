<script lang="ts">
  import { BedDouble, Clock, MapPinOff, StickyNote, TrainFront } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { formatDay, type Day } from '../airtable/itinerary';
  import { formatDuration } from '../airtable/activities';
  import Img from './Img.svelte';
  import TypeIcon from './TypeIcon.svelte';

  let { day, number }: { day: Day; number: number } = $props();

  const when = $derived(formatDay(day.date));
  const active = $derived(app.activeDayId === day.id);
  const acts = $derived(day.activityIds.map((id) => app.activities.find((a) => a.id === id)).filter((a) => !!a));
  const missing = $derived(day.activityIds.length - acts.length);
</script>

<article
  data-day={day.id}
  class="relative scroll-mt-4 pl-14"
>
  <!-- timeline bubble -->
  <button
    class="absolute top-4 left-0 flex size-11 flex-col items-center justify-center rounded-2xl text-white shadow-lg transition {active
      ? 'scale-110 bg-gradient-to-br from-violet-500 to-fuchsia-500'
      : 'bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700'}"
    title="Show day on map"
    onclick={() => (app.activeDayId = day.id)}
  >
    <span class="text-[9px] leading-none font-semibold uppercase opacity-80">Day</span>
    <span class="text-base leading-none font-extrabold">{number}</span>
  </button>

  <div
    role="button"
    tabindex="0"
    class="rounded-3xl border p-4 transition {active
      ? 'border-violet-400/60 bg-white/55 shadow-xl shadow-violet-500/10 dark:bg-white/8'
      : 'border-[var(--hairline)] bg-white/25 hover:bg-white/40 dark:bg-white/3 dark:hover:bg-white/6'}"
    onclick={() => (app.activeDayId = day.id)}
    onkeydown={(e) => e.key === 'Enter' && (app.activeDayId = day.id)}
  >
    <header class="flex flex-wrap items-baseline gap-x-2">
      {#if when}
        <span class="text-lg font-extrabold tracking-tight">{when.weekday} {when.date}</span>
      {:else}
        <span class="text-muted text-sm font-semibold">No date</span>
      {/if}
      {#if day.title}<span class="text-muted text-sm font-medium">{day.title}</span>{/if}
    </header>

    {#if day.travel}
      <div class="mt-3 flex items-start gap-2.5 rounded-2xl bg-sky-500/12 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
        <TrainFront class="mt-0.5 size-4 shrink-0" />
        <span>{day.travel}</span>
      </div>
    {/if}

    {#if acts.length || missing}
      <ul class="mt-3 space-y-1.5">
        {#each acts as a (a.id)}
          <li>
            <button
              class="group flex w-full items-center gap-3 rounded-2xl p-1 pr-2 text-left transition hover:bg-white/50 dark:hover:bg-white/8 {app.hoveredId === a.id ? 'bg-white/50 dark:bg-white/8' : ''}"
              onclick={(e) => {
                e.stopPropagation();
                app.activeDayId = day.id;
                app.selectedId = a.id;
              }}
              onmouseenter={() => (app.hoveredId = a.id)}
              onmouseleave={() => (app.hoveredId = null)}
            >
              <div class="relative shrink-0">
                <Img att={a.images[0]} alt={a.name} class="size-11 rounded-xl" />
                <span
                  class="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full text-white ring-2 ring-white/80 dark:ring-slate-800"
                  style="background:{app.colorOf(a)}"
                >
                  <TypeIcon type={a.type} class="size-3" />
                </span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold group-hover:text-violet-600 dark:group-hover:text-violet-400">{a.name}</div>
                <div class="text-muted flex items-center gap-2 truncate text-xs">
                  {#if a.durationSec}<span class="flex items-center gap-0.5"><Clock class="size-3" />{formatDuration(a.durationSec)}</span>{/if}
                  {#if a.priority}<span>{a.priority}</span>{/if}
                  {#if a.lat === undefined}<span class="flex items-center gap-0.5 text-amber-600"><MapPinOff class="size-3" />unplaced</span>{/if}
                </div>
              </div>
            </button>
          </li>
        {/each}
        {#if missing}
          <li class="text-muted pl-1 text-xs">+{missing} linked activit{missing === 1 ? 'y' : 'ies'} not found</li>
        {/if}
      </ul>
    {/if}

    {#if day.notes}
      <div class="text-muted mt-3 flex items-start gap-2.5 text-sm">
        <StickyNote class="mt-0.5 size-4 shrink-0" />
        <p class="leading-relaxed whitespace-pre-line">{day.notes}</p>
      </div>
    {/if}

    {#if day.city || day.accommodation}
      <footer class="mt-3 flex items-center gap-2 border-t border-[var(--hairline)] pt-3 text-sm">
        <BedDouble class="size-4 shrink-0 text-violet-500" />
        <span class="font-semibold">{day.city ?? 'Overnight'}</span>
        {#if day.accommodation}<span class="text-muted truncate">· {day.accommodation}</span>{/if}
      </footer>
    {/if}
  </div>
</article>
