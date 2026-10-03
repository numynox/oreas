<script lang="ts">
  import { Columns3, Database, KeyRound, ShieldCheck, Trash2 } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { loadLocalSettings } from '../airtable/config';
  import Modal from './Modal.svelte';
  import OfflinePanel from './OfflinePanel.svelte';

  const local = loadLocalSettings();
  const proxy = app.config?.mode === 'proxy';
  let baseId = $state(local.baseId ?? app.config?.baseId ?? '');
  let table = $state(local.table ?? app.config?.table ?? 'Activities');
  let apiKey = $state(local.apiKey ?? '');

  const validBase = $derived(/^app[A-Za-z0-9]{14}$/.test(baseId.trim()));
  const canSave = $derived(validBase && table.trim() && (proxy || apiKey.trim()));

  function save() {
    // In proxy mode only store overrides that differ from the server config.
    app.saveSettings({
      baseId: proxy && baseId.trim() === app.server?.baseId ? undefined : baseId,
      table: proxy && table.trim() === app.server?.table ? undefined : table,
      apiKey: proxy ? undefined : apiKey,
    });
    app.showSettings = false;
  }

  const configured = $derived(!!app.cache);
  const input =
    'w-full rounded-xl border border-[var(--border)] bg-white/45 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15 dark:bg-slate-900/35';
</script>

<Modal title="Settings" onclose={configured ? () => (app.showSettings = false) : undefined}>
  <div class="space-y-5">
    {#if proxy}
      <div class="flex gap-3 rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
        <ShieldCheck class="mt-0.5 size-5 shrink-0" />
        <div>
          <b>API key managed by the server.</b> Requests go through the local proxy, so the key never reaches this browser.
        </div>
      </div>
    {:else}
      <div class="flex gap-3 rounded-2xl bg-violet-500/10 p-3 text-sm">
        <KeyRound class="mt-0.5 size-5 shrink-0 text-violet-500" />
        <div>
          Create a <a class="text-violet-600 underline dark:text-violet-400" href="https://airtable.com/create/tokens" target="_blank" rel="noopener noreferrer">personal access token</a>
          with scopes <code class="text-xs">data.records:read</code>, <code class="text-xs">schema.bases:read</code> and (for ratings)
          <code class="text-xs">data.records:write</code>, limited to your trip base.
          It is stored only in this browser's localStorage.
        </div>
      </div>
    {/if}

    <label class="block space-y-1">
      <span class="text-sm font-medium">Base ID</span>
      <input class={input} bind:value={baseId} placeholder="appXXXXXXXXXXXXXX" spellcheck="false" />
      {#if baseId && !validBase}<span class="text-xs text-rose-500">Base IDs start with "app" and have 17 characters.</span>{/if}
      <span class="text-muted block text-xs">From the Airtable URL: airtable.com/<b>app…</b>/tbl…</span>
    </label>

    <label class="block space-y-1">
      <span class="text-sm font-medium">Table (name or ID)</span>
      <input class={input} bind:value={table} placeholder="Activities" spellcheck="false" />
    </label>

    {#if !proxy}
      <label class="block space-y-1">
        <span class="text-sm font-medium">Personal access token</span>
        <input class={input} type="password" bind:value={apiKey} placeholder="pat…" autocomplete="off" spellcheck="false" />
      </label>
    {/if}

    {#if configured}
      <div class="border-t border-[var(--hairline)] pt-4"><OfflinePanel /></div>
      <div class="flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-4">
        <button
          class="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-slate-500/10"
          onclick={() => {
            app.showSettings = false;
            app.showMapping = true;
          }}
        >
          <Columns3 class="size-4" /> Field mapping
          {#if app.resolved?.unresolved.length}
            <span class="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{app.resolved.unresolved.length}</span>
          {/if}
        </button>
        <button
          class="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-slate-500/10"
          onclick={() => {
            app.clearCache();
            app.showSettings = false;
          }}
        >
          <Trash2 class="size-4" /> Clear data cache & resync
        </button>
      </div>
      <p class="text-muted flex items-center gap-1.5 text-xs">
        <Database class="size-3.5" />
        {app.cache?.records.length ?? 0} records cached · auto-sync after 24 h
      </p>
    {/if}
  </div>

  {#snippet footer()}
    {#if configured}
      <button class="rounded-xl px-4 py-2 text-sm transition hover:bg-slate-500/10" onclick={() => (app.showSettings = false)}>Cancel</button>
    {/if}
    <button
      class="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
      disabled={!canSave}
      onclick={save}
    >
      Save & sync
    </button>
  {/snippet}
</Modal>
