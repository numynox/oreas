<script lang="ts">
  import { CircleAlert, Check } from '@lucide/svelte';
  import { ITINERARY_TABLE, app } from '../state.svelte';
  import { DEFS, compatibleFields, resolveMapping, type FieldDef, type MappingKind } from '../airtable/fields';
  import Modal from './Modal.svelte';

  const schema = app.cache?.schema;
  let kind = $state<MappingKind>(app.mode === 'itinerary' && !app.resolved?.blocking ? 'itinerary' : 'activities');

  // One draft per table kind, initialised from the current resolution.
  function initial(k: MappingKind) {
    const r = k === 'activities' ? app.resolved : app.resolvedDays;
    const defs = DEFS[k] as FieldDef<string>[];
    const fields = (r?.fields ?? {}) as Record<string, { id: string } | undefined>;
    return {
      tableId: r?.table?.id ?? '',
      fields: Object.fromEntries(defs.map((d) => [d.key, fields[d.key]?.id ?? ''])) as Record<string, string>,
      unresolved: new Set((r?.unresolved ?? []).map((d) => d.key as string)),
      missingTable: !r?.table,
      unresolvedNames: (r?.unresolved ?? []).map((d) => d.defaultName),
    };
  }
  let drafts = $state({ activities: initial('activities'), itinerary: initial('itinerary') });
  const draft = $derived(drafts[kind]);
  const defs = $derived(DEFS[kind] as FieldDef<string>[]);
  const table = $derived(schema?.tables.find((t) => t.id === draft.tableId));

  function onTableChange(id: string) {
    if (!schema) return;
    const r = resolveMapping(schema, id, { tableId: id, fields: {} }, defs);
    const fields = r.fields as Record<string, { id: string } | undefined>;
    drafts[kind].tableId = id;
    drafts[kind].fields = Object.fromEntries(defs.map((d) => [d.key, fields[d.key]?.id ?? '']));
  }

  const missingRequired = $derived(defs.filter((d) => d.required && !draft.fields[d.key]));

  function save() {
    const a = drafts.activities;
    if (a.tableId) app.setMapping({ tableId: a.tableId, fields: Object.fromEntries(DEFS.activities.map((d) => [d.key, a.fields[d.key] || null])) });
    const i = drafts.itinerary;
    if (i.tableId) app.setItineraryMapping({ tableId: i.tableId, fields: Object.fromEntries(DEFS.itinerary.map((d) => [d.key, i.fields[d.key] || null])) });
    app.showMapping = false;
  }

  const canSave = $derived(
    !!drafts.activities.tableId &&
      (['activities', 'itinerary'] as const).every((k) => !drafts[k].tableId || DEFS[k].every((d) => !d.required || drafts[k].fields[d.key])),
  );

  const select =
    'w-full rounded-xl border bg-white/45 px-3 py-2 text-sm outline-none transition focus:ring-4 focus:ring-violet-500/15 dark:bg-slate-900/35';
</script>

<Modal title="Field mapping" wide onclose={() => (app.showMapping = false)}>
  {#if !schema}
    <p class="text-muted text-sm">Sync once to load the table schema.</p>
  {:else}
    <div class="mb-4 inline-flex rounded-xl bg-slate-500/10 p-1 text-sm">
      {#each [['activities', 'Activities'], ['itinerary', 'Itinerary']] as [k, label] (k)}
        <button
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition {kind === k ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-muted'}"
          onclick={() => (kind = k as MappingKind)}
        >
          {label}
          {#if drafts[k as MappingKind].unresolved.size}<span class="size-1.5 rounded-full bg-amber-500"></span>{/if}
        </button>
      {/each}
    </div>

    <p class="text-muted mb-4 text-sm">
      Oreas remembers columns by their Airtable field ID, so renaming a column in Airtable is fine. If a column was deleted or
      replaced, pick the column to use instead. Only columns with a compatible type are listed.
    </p>

    {#if draft.unresolvedNames.length || draft.missingTable}
      <div class="mb-4 flex gap-2 rounded-2xl bg-amber-500/12 p-3 text-sm text-amber-800 dark:text-amber-300">
        <CircleAlert class="mt-0.5 size-4 shrink-0" />
        <div>
          {#if draft.missingTable}
            {kind === 'activities'
              ? `The configured table "${app.config?.table}" was not found. Pick a table below.`
              : `No "${ITINERARY_TABLE}" table found. Pick the table holding your day-by-day plan (optional).`}
          {:else}
            Not found: <b>{draft.unresolvedNames.join(', ')}</b>. Select replacement columns or choose “none”.
          {/if}
        </div>
      </div>
    {/if}

    <label class="mb-5 block space-y-1">
      <span class="text-sm font-medium">Table</span>
      <select class="{select} border-[var(--border)]" value={draft.tableId} onchange={(e) => onTableChange(e.currentTarget.value)}>
        <option value="">{kind === 'activities' ? 'Select a table…' : '— no itinerary —'}</option>
        {#each schema.tables as t (t.id)}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
    </label>

    {#if table}
      <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {#each defs as def (def.key)}
          {@const options = compatibleFields(def, table)}
          {@const missing = draft.unresolved.has(def.key) && !draft.fields[def.key]}
          <label class="block space-y-1">
            <span class="flex items-center gap-1.5 text-sm font-medium">
              {def.label}
              {#if def.required}<span class="text-rose-500">*</span>{/if}
              {#if draft.fields[def.key]}<Check class="size-3.5 text-emerald-500" />{/if}
              {#if missing}<CircleAlert class="size-3.5 text-amber-500" />{/if}
            </span>
            <select
              class="{select} {missing || (def.required && !draft.fields[def.key]) ? 'border-amber-500' : 'border-[var(--border)]'}"
              bind:value={drafts[kind].fields[def.key]}
            >
              <option value="">{def.required ? 'Select a column…' : '— none —'}</option>
              {#each options as f (f.id)}
                <option value={f.id}>{f.name} ({f.type})</option>
              {/each}
            </select>
            {#if !options.length}
              <span class="text-muted text-xs">No compatible column ({def.types.join(', ')}).</span>
            {/if}
          </label>
        {/each}
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    {#if missingRequired.length}
      <span class="mr-auto text-xs text-amber-600">Required: {missingRequired.map((d) => d.label).join(', ')}</span>
    {/if}
    <button class="rounded-xl px-4 py-2 text-sm transition hover:bg-slate-500/10" onclick={() => (app.showMapping = false)}>Cancel</button>
    <button
      class="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
      disabled={!canSave}
      onclick={save}
    >
      Save mapping
    </button>
  {/snippet}
</Modal>
