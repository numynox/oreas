<script lang="ts">
  import { Check, Columns3, Copy, Database, KeyRound, Link, LoaderCircle, ShieldCheck, Trash2 } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { loadLocalSettings } from '../airtable/config';
  import Modal from './Modal.svelte';
  import OfflinePanel from './OfflinePanel.svelte';
  import { encryptShare, shareUrl } from '../share';

  const local = loadLocalSettings();
  /** A server proxy is available: tokens are optional (entered tokens take precedence over it). */
  const proxy = !!app.server;
  let baseId = $state(local.baseId ?? app.config?.baseId ?? '');
  let writeKey = $state(local.writeKey ?? '');
  let readKey = $state(local.readKey ?? '');

  const validBase = $derived(/^app[A-Za-z0-9]{14}$/.test(baseId.trim()));
  const canSave = $derived(validBase && (proxy || writeKey.trim() || readKey.trim()));
  const sameKey = $derived(!!readKey.trim() && readKey.trim() === writeKey.trim());

  function save() {
    // With a server proxy only store a base ID that differs from the server config.
    app.saveSettings({
      baseId: proxy && baseId.trim() === app.server?.baseId ? undefined : baseId,
      writeKey,
      readKey,
    });
    app.showSettings = false;
  }

  // ---- read-only share link ----
  let sharePassword = $state('');
  let sharePassword2 = $state('');
  let link = $state('');
  let creating = $state(false);
  let copied = $state(false);
  const canShare = $derived(validBase && !!readKey.trim() && !sameKey);
  const passwordOk = $derived(sharePassword.length >= 8 && sharePassword === sharePassword2);

  async function createLink() {
    creating = true;
    copied = false;
    try {
      link = shareUrl(await encryptShare({ baseId: baseId.trim(), readKey: readKey.trim() }, sharePassword));
    } catch {
      app.toast('error', 'Could not create the link (needs a secure https connection).');
    } finally {
      creating = false;
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      app.toast('error', 'Copy failed – select the link and copy it manually.');
    }
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
          Leave the tokens below empty to use it.
        </div>
      </div>
    {/if}
    <div class="flex gap-3 rounded-2xl bg-violet-500/10 p-3 text-sm">
      <KeyRound class="mt-0.5 size-5 shrink-0 text-violet-500" />
      <div>
        Create <a class="text-violet-600 underline dark:text-violet-400" href="https://airtable.com/create/tokens" target="_blank" rel="noopener noreferrer">personal access tokens</a>
        limited to your trip base. One token is enough:
        <ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs">
          <li><b>Write token</b>: <code>data.records:read</code>, <code>schema.bases:read</code>, <code>data.records:write</code> (ratings) and <code>schema.bases:write</code> (creating missing tables/columns).</li>
          <li><b>Read-only token</b>: only <code>data.records:read</code> and <code>schema.bases:read</code>. Needed to share a read-only link.</li>
        </ul>
        <span class="text-xs">Tokens are stored only in this browser's localStorage. Without a write token Oreas is read-only.</span>
      </div>
    </div>

    <label class="block space-y-1">
      <span class="text-sm font-medium">Base ID</span>
      <input class={input} bind:value={baseId} placeholder="appXXXXXXXXXXXXXX" spellcheck="false" />
      {#if baseId && !validBase}<span class="text-xs text-rose-500">Base IDs start with "app" and have 17 characters.</span>{/if}
      <span class="text-muted block text-xs">From the Airtable URL: airtable.com/<b>app…</b>/tbl…</span>
    </label>

    <p class="text-muted text-xs">
      Oreas looks for the tables <b>Activities</b> and <b>Itinerary</b> in this base. If yours are named differently, pick them
      under <b>Field mapping</b> after the first sync.
    </p>

    <div class="grid gap-3 sm:grid-cols-2">
      <label class="block space-y-1">
        <span class="text-sm font-medium">Write token</span>
        <input class={input} type="password" bind:value={writeKey} placeholder="pat… (optional)" autocomplete="off" spellcheck="false" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-medium">Read-only token</span>
        <input class={input} type="password" bind:value={readKey} placeholder="pat… (optional)" autocomplete="off" spellcheck="false" />
      </label>
    </div>
    {#if sameKey}
      <p class="text-xs text-amber-700 dark:text-amber-400">Both fields hold the same token. Use a separate token with read scopes only for the read-only field.</p>
    {/if}

    {#if canShare}
      <div class="space-y-3 border-t border-[var(--hairline)] pt-4">
        <div>
          <div class="flex items-center gap-1.5 text-sm font-semibold"><Link class="size-4" /> Share read-only link</div>
          <p class="text-muted mt-1 text-xs">
            The link contains the base ID and your <b>read-only</b> token, encrypted with a password. Send the password
            separately. Anyone with both can view (not change) your trip. To revoke access, delete the token in Airtable.
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <input class={input} type="password" bind:value={sharePassword} placeholder="Password (min. 8 characters)" autocomplete="new-password" aria-label="Share password" oninput={() => (link = '')} />
          <input class={input} type="password" bind:value={sharePassword2} placeholder="Repeat password" autocomplete="new-password" aria-label="Repeat share password" oninput={() => (link = '')} />
        </div>
        {#if sharePassword2 && sharePassword !== sharePassword2}<p class="text-xs text-rose-500">The passwords differ.</p>{/if}
        {#if link}
          <div class="flex gap-2">
            <input class="{input} font-mono text-xs" readonly value={link} aria-label="Share link" onfocus={(e) => e.currentTarget.select()} />
            <button
              class="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-slate-500/10"
              onclick={copyLink}
            >
              {#if copied}<Check class="size-4 text-emerald-500" /> Copied{:else}<Copy class="size-4" /> Copy{/if}
            </button>
          </div>
        {:else}
          <button
            class="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-slate-500/10 disabled:opacity-40"
            disabled={!passwordOk || creating}
            onclick={createLink}
          >
            {#if creating}<LoaderCircle class="size-4 animate-spin" />{:else}<Link class="size-4" />{/if}
            Create link
          </button>
        {/if}
      </div>
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
