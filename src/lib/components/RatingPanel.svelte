<script lang="ts">
  import { ArrowLeft, SkipForward, X } from '@lucide/svelte';
  import { RATINGS, app } from '../state.svelte';
  import { airtableColor } from '../colors';
  import { choicesOf } from '../airtable/activities';

  const r = $derived(app.rating!);
  const current = $derived(app.activities.find((a) => a.id === app.ratingCurrentId));
  const choices = $derived(choicesOf(app.resolved?.fields.priority));
  const color = (v: string) => airtableColor(choices.find((c) => c.name === v)?.color) ?? '#8b5cf6';
  const pct = $derived(Math.round((r.index / r.queue.length) * 100));

  function onKey(e: KeyboardEvent) {
    if (app.showSettings || app.showMapping || app.lightbox) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= RATINGS.length) app.rate(RATINGS[n - 1]);
    else if (e.key === 'ArrowRight' || e.key === 's') app.ratingStep(1);
    else if (e.key === 'ArrowLeft') app.ratingStep(-1);
    else if (e.key === 'Escape') app.stopRating();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="space-y-3 border-t border-[var(--hairline)] bg-violet-500/8 p-4">
  <div class="flex items-center gap-2 text-xs">
    <span class="font-semibold">Rate this activity</span>
    <span class="text-muted tabular-nums">{r.index + 1} / {r.queue.length}</span>
    <div class="h-1 flex-1 overflow-hidden rounded-full bg-slate-500/15">
      <div class="h-full rounded-full bg-violet-500 transition-all duration-500" style="width:{pct}%"></div>
    </div>
    <button class="text-muted rounded-full p-1 hover:bg-slate-500/10" title="Stop rating (Esc)" onclick={() => app.stopRating()}>
      <X class="size-4" />
    </button>
  </div>

  <div class="grid grid-cols-4 gap-2">
    {#each RATINGS as v, i (v)}
      {@const active = current?.priority === v}
      <button
        class="group flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2.5 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
        style="border-color:{color(v)};{active ? `background:${color(v)};color:white` : `color:${color(v)}`}"
        onclick={() => app.rate(v)}
      >
        <span class="flex gap-0.5">
          {#each { length: i + 1 } as _, k (k)}
            <span class="size-1.5 rounded-full" style="background:{active ? 'white' : color(v)}"></span>
          {/each}
        </span>
        <span class="text-center leading-tight">{v}</span>
        <span class="text-[9px] font-normal opacity-60">{i + 1}</span>
      </button>
    {/each}
  </div>

  <div class="text-muted flex items-center justify-between text-xs">
    <button class="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-500/10 disabled:opacity-40" disabled={r.index === 0} onclick={() => app.ratingStep(-1)}>
      <ArrowLeft class="size-3.5" /> Back
    </button>
    <span class="hidden sm:inline">Keys 1–4 · ← → · Esc</span>
    <button class="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-500/10" onclick={() => app.ratingStep(1)}>
      Skip <SkipForward class="size-3.5" />
    </button>
  </div>
</div>
