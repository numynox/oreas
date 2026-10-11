<script lang="ts">
  import { Eye, LoaderCircle, LockKeyhole } from '@lucide/svelte';
  import { app } from '../state.svelte';
  import { loadLocalSettings } from '../airtable/config';
  import { decryptShare } from '../share';
  import Modal from './Modal.svelte';

  /** Opened by a share link (`#share=…`): asks for the password, then stores the read-only token. */
  const local = loadLocalSettings();
  const replaces = !!(local.writeKey || local.readKey);

  let password = $state('');
  let busy = $state(false);
  let error = $state('');

  async function unlock(e: SubmitEvent) {
    e.preventDefault();
    if (!app.shareToken || !password) return;
    busy = true;
    error = '';
    try {
      app.acceptShare(await decryptShare(app.shareToken, password));
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      error =
        code === 'WrongPassword'
          ? 'Wrong password.'
          : code === 'BadLink'
            ? 'This link is damaged or incomplete. Ask for a new one.'
            : 'This browser cannot open the link (it needs a secure https connection).';
    } finally {
      busy = false;
    }
  }

  const input =
    'w-full rounded-xl border border-[var(--border)] bg-white/45 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15 dark:bg-slate-900/35';
</script>

<Modal title="Shared trip" onclose={() => app.leaveShare()}>
  <form id="share-unlock" class="space-y-4" onsubmit={unlock}>
    <div class="flex gap-3 rounded-2xl bg-violet-500/10 p-3 text-sm">
      <Eye class="mt-0.5 size-5 shrink-0 text-violet-500" />
      <div>
        Someone shared their trip with you (<b>read-only</b>). Enter the password you got from them. The access token is
        then stored in this browser only.
      </div>
    </div>
    <label class="block space-y-1">
      <span class="text-sm font-medium">Password</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class={input} type="password" bind:value={password} autocomplete="off" autofocus />
      {#if error}<span class="text-xs text-rose-500">{error}</span>{/if}
    </label>
    {#if replaces}
      <p class="text-xs text-amber-700 dark:text-amber-400">This replaces the Airtable tokens currently saved in this browser.</p>
    {/if}
  </form>

  {#snippet footer()}
    <button class="rounded-xl px-4 py-2 text-sm transition hover:bg-slate-500/10" onclick={() => app.leaveShare()}>Cancel</button>
    <button
      form="share-unlock"
      type="submit"
      class="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
      disabled={!password || busy}
    >
      {#if busy}<LoaderCircle class="size-4 animate-spin" />{:else}<LockKeyhole class="size-4" />{/if}
      Open trip
    </button>
  {/snippet}
</Modal>
