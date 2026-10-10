import { tick, untrack } from 'svelte';
import { scrollToDay } from './airtable/itinerary';
import { app, type Mode } from './state.svelte';

/**
 * In-app back button.
 *
 * Every app screen (mode, opened activity, selected day / stop, dialogs, lightbox) becomes a browser
 * history entry, so the back button (or the Android back gesture) returns to the previous screen
 * instead of leaving the app. Closing something in the UI that brings back the previous screen goes
 * back in history rather than adding an entry, so open/close cycles do not pile up.
 *
 * Leaving: the first entry is a guard. Back on the first screen lands on it, restores that screen and
 * pushes it again, so the app is never left by accident. The guard is only added on the first user
 * interaction: browsers skip history entries that a page adds without one.
 */

interface Screen {
  mode: Mode;
  selectedId: string | null;
  activeDayId: string | null;
  activeStayDayIds: string[] | null;
  showSettings: boolean;
  showMapping: boolean;
  lightbox: typeof app.lightbox;
}

interface Entry {
  oreas: 1;
  /** Position in this tab's history (0 = guard). */
  i: number;
  screen: Screen;
}

function capture(): Screen {
  return {
    mode: app.mode,
    selectedId: app.selectedId,
    activeDayId: app.activeDayId,
    activeStayDayIds: app.activeStayDayIds,
    showSettings: app.showSettings,
    showMapping: app.showMapping,
    lightbox: app.lightbox,
  };
}

/** Identity of a screen (the lightbox counts as one screen while swiping through its images). */
function keyOf(s: Screen): string {
  return JSON.stringify({ ...s, lightbox: s.lightbox ? (s.lightbox.images[0]?.id ?? true) : null });
}

const entry = (i: number, screen: Screen): Entry => ({ oreas: 1, i, screen: JSON.parse(JSON.stringify(screen)) as Screen });
const urlOf = (s: Screen) => (s.mode === 'itinerary' ? '#itinerary' : location.pathname + location.search);
const isEntry = (v: unknown): v is Entry => !!v && typeof v === 'object' && (v as Entry).oreas === 1;

function restore(s: Screen) {
  const dayChanged = s.activeDayId !== app.activeDayId;
  app.mode = s.mode;
  app.selectedId = s.selectedId;
  app.activeStayDayIds = s.activeStayDayIds;
  app.activeDayId = s.activeDayId;
  app.showSettings = s.showSettings;
  app.showMapping = s.showMapping;
  app.lightbox = s.lightbox;
  if (dayChanged && s.activeDayId) void tick().then(() => scrollToDay(s.activeDayId!));
}

export function startNavigation() {
  const prev: unknown = history.state;
  /** Index of the current entry, and the screen keys of the entries known in this session. */
  let index = isEntry(prev) ? prev.i : 0;
  /** Guard in place (a reloaded page keeps the entries of its earlier session). */
  let armed = index > 0;
  const keys: string[] = [];
  keys[index] = keyOf(capture());
  history.replaceState(entry(index, capture()), '', urlOf(capture()));

  const arm = () => {
    if (armed) return;
    armed = true;
    // Current screen moves up to entry 1; entry 0 stays below it as the guard.
    const s = capture();
    index = 1;
    keys.length = 0;
    keys[0] = keys[1] = keyOf(s);
    history.pushState(entry(1, s), '', urlOf(s));
  };
  window.addEventListener('pointerdown', arm, { capture: true });
  window.addEventListener('keydown', arm, { capture: true });

  window.addEventListener('popstate', (e) => {
    if (!isEntry(e.state)) return; // an entry not made by us (e.g. a typed #hash): keep the current screen
    index = e.state.i;
    keys[index] = keyOf(e.state.screen);
    restore(e.state.screen);
    if (index === 0 && armed) {
      // Back on the first screen: stay in the app.
      index = 1;
      keys.length = 2;
      keys[1] = keys[0];
      history.pushState(entry(1, e.state.screen), '', urlOf(e.state.screen));
    }
  });

  // Record screen changes.
  $effect.root(() => {
    $effect(() => {
      const s = capture();
      const k = keyOf(s);
      untrack(() => {
        if (k === keys[index]) return; // unchanged, or just restored from history
        if (!armed) {
          // Before any interaction (loading, preselecting today): update the entry in place.
          keys[index] = k;
          history.replaceState(entry(index, s), '', urlOf(s));
        } else if (index >= 2 && keys[index - 1] === k) {
          history.back(); // back to the previous screen (e.g. closed a dialog): popstate restores it
        } else {
          index++;
          keys.length = index;
          keys[index] = k;
          history.pushState(entry(index, s), '', urlOf(s));
        }
      });
    });
  });
}
