<script lang="ts">
  import { CircleAlert, Check, LoaderCircle, Plus } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { DEFS, TABLE_NAMES, compatibleFields, resolveMapping, type FieldDef, type MappingKind } from '../airtable/fields';
  import { NONE, describe, execute, plan, type Draft, type Drafts } from '../airtable/create';
  import Modal from './Modal.svelte';

  // Reactive, so newly created tables/columns appear in the dropdowns after the re-sync.
  const schema = $derived(app.cache?.schema);
  let kind = $state<MappingKind>(app.mode === 'itinerary' && !app.resolved?.blocking ? 'itinerary' : 'activities');

  /**
   * Draft values per column: a field ID, '' ("Select a column…" = missing, can be created) or NONE (not used).
   * Columns that were intentionally unmapped before start as NONE, unresolved ones as ''.
   */
  function initial(k: MappingKind): Draft {
    const r = k === 'activities' ? app.resolved : app.resolvedDays;
    const stored = (k === 'activities' ? app.mapping : app.itineraryMapping).fields as Record<string, string | null | undefined>;
    const fields = (r?.fields ?? {}) as Record<string, { id: string } | undefined>;
    return {
      tableId: r?.table?.id ?? '',
      fields: Object.fromEntries((DEFS[k] as FieldDef<string>[]).map((d) => [d.key, fields[d.key]?.id ?? (stored[d.key] === null ? NONE : '')])),
    };
  }
  let drafts = $state<Drafts>({ activities: initial('activities'), itinerary: initial('itinerary') });
  const meta = {
    activities: { missingTable: !app.resolved?.table, unresolved: (app.resolved?.unresolved ?? []).map((d) => d.defaultName) },
    itinerary: { missingTable: !app.resolvedDays?.table, unresolved: (app.resolvedDays?.unresolved ?? []).map((d) => d.defaultName) },
  };

  const draft = $derived(drafts[kind]);
  const defs = $derived(DEFS[kind] as FieldDef<string>[]);
  const table = $derived(schema?.tables.find((t) => t.id === draft.tableId));

  function onTableChange(id: string) {
    drafts[kind].tableId = id;
    if (!schema || !id || id === NONE) return;
    const r = resolveMapping(schema, id, { tableId: id, fields: {} }, defs);
    const fields = r.fields as Record<string, { id: string } | undefined>;
    drafts[kind].fields = Object.fromEntries(defs.map((d) => [d.key, fields[d.key]?.id ?? '']));
  }

  const isId = (v: string) => !!v && v !== NONE;
  const missingRequired = $derived(isId(draft.tableId) ? defs.filter((d) => d.required && !isId(draft.fields[d.key])) : []);

  // ---- create missing tables / columns ----
  const todo = $derived(plan(drafts));
  const todoText = $derived(describe(todo));
  let creating = $state(false);

  function persist(d: Drafts) {
    const toStored = (k: MappingKind) =>
      Object.fromEntries(
        (DEFS[k] as FieldDef<string>[])
          .filter((def) => d[k].fields[def.key] !== '') // '' = not chosen → resolve by name / report as missing
          .map((def) => [def.key, d[k].fields[def.key] === NONE ? null : d[k].fields[def.key]]),
      );
    // Set both mappings before the (async) sync that the first call may start.
    if (isId(d.activities.tableId)) app.setMapping({ tableId: d.activities.tableId, fields: toStored('activities') });
    if (isId(d.itinerary.tableId)) app.setItineraryMapping({ tableId: d.itinerary.tableId, fields: toStored('itinerary') });
  }

  async function createMissing() {
    if (!schema || !app.config) return;
    creating = true;
    try {
      drafts = await execute(app.config, schema, $state.snapshot(drafts) as Drafts, todo);
      persist(drafts);
      await app.sync();
      app.toast('success', 'Missing tables and columns were created in Airtable.', undefined, 4000);
    } catch (e) {
      app.toast('error', `Creating failed: ${e instanceof Error ? e.message : e}`, undefined, 10000);
      void app.sync(); // pick up whatever was created before the error
    } finally {
      creating = false;
    }
  }

  function save() {
    persist(drafts);
    app.showMapping = false;
  }

  const canSave = $derived(
    isId(drafts.activities.tableId) &&
      (['activities', 'itinerary'] as const).every(
        (k) => !isId(drafts[k].tableId) || DEFS[k].every((d) => !d.required || isId(drafts[k].fields[d.key])),
      ),
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
          {#if meta[k as MappingKind].unresolved.length}<span class="size-1.5 rounded-full bg-amber-500"></span>{/if}
        </button>
      {/each}
    </div>

    <p class="text-muted mb-4 text-sm">
      Oreas remembers columns by their Airtable field ID, so renaming a column in Airtable is fine. If a column was deleted or
      replaced, pick the column to use instead. Only columns with a compatible type are listed. Leave a column on
      <i>Select a column…</i> to have it created, or choose <i>— none —</i> to not use it.
    </p>

    {#if meta[kind].unresolved.length || meta[kind].missingTable}
      <div class="mb-4 flex gap-2 rounded-2xl bg-amber-500/12 p-3 text-sm text-amber-800 dark:text-amber-300">
        <CircleAlert class="mt-0.5 size-4 shrink-0" />
        <div>
          {#if meta[kind].missingTable}
            {kind === 'activities'
              ? `No "${TABLE_NAMES.activities}" table found. Pick the table holding your activities, or create it below.`
              : `No "${TABLE_NAMES.itinerary}" table found. Pick the table holding your day-by-day plan, create it below, or choose “no itinerary”.`}
          {:else}
            Not found: <b>{meta[kind].unresolved.join(', ')}</b>. Select replacement columns, create them below, or choose “none”.
          {/if}
        </div>
      </div>
    {/if}

    <label class="mb-5 block space-y-1">
      <span class="text-sm font-medium">Table</span>
      <select class="{select} border-[var(--border)]" value={draft.tableId} onchange={(e) => onTableChange(e.currentTarget.value)}>
        <option value="">Select a table…</option>
        {#if kind === 'itinerary'}<option value={NONE}>— no itinerary —</option>{/if}
        {#each schema.tables as t (t.id)}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
    </label>

    {#if table}
      <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {#each defs as def (def.key)}
          {@const options = compatibleFields(def, table)}
          {@const value = draft.fields[def.key]}
          <label class="block space-y-1">
            <span class="flex items-center gap-1.5 text-sm font-medium">
              {def.label}
              {#if def.required}<span class="text-rose-500">*</span>{/if}
              {#if isId(value)}<Check class="size-3.5 text-emerald-500" />{/if}
              {#if !value}<CircleAlert class="size-3.5 text-amber-500" />{/if}
            </span>
            <select class="{select} {!value ? 'border-amber-500' : 'border-[var(--border)]'}" bind:value={drafts[kind].fields[def.key]}>
              <option value="">Select a column…</option>
              {#if !def.required}<option value={NONE}>— none —</option>{/if}
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
    {:else if !draft.tableId}
      <p class="text-muted text-sm">This table will be created with all {defs.length} columns.</p>
    {/if}

    {#if todoText.length}
      <div class="mt-5 space-y-2 rounded-2xl border border-violet-500/30 bg-violet-500/8 p-3 text-sm">
        <div class="font-semibold">Missing in Airtable</div>
        <ul class="text-muted list-disc space-y-0.5 pl-5 text-xs">
          {#each todoText as line (line)}<li>{line}</li>{/each}
        </ul>
        <button
          class="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
          disabled={creating || !app.online}
          onclick={createMissing}
        >
          {#if creating}<LoaderCircle class="size-4 animate-spin" />{:else}<Plus class="size-4" />{/if}
          Create missing tables and columns
        </button>
        <p class="text-muted text-[11px]">Needs the token scope <code>schema.bases:write</code>. Existing data is not changed.</p>
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
      disabled={!canSave || creating}
      onclick={save}
    >
      Save mapping
    </button>
  {/snippet}
</Modal>
