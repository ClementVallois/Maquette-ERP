/**
 * Items 17/23, QA round 3: a UI preference read/written the same guarded way
 * `routes/_shell.tsx`'s `SIDEBAR_COLLAPSED_KEY` already is — `localStorage`, never sent to the
 * API, wrapped in try/catch (private browsing, storage disabled, or no `window` yet all degrade
 * to "use the default" rather than throw).
 *
 * The two callers this exists for (the company-news module's "seen" marker, the dashboard
 * charts' show/hide) both need the key **scoped by persona key**, not a bare constant: this app's
 * persona switch is a full identity change on the same origin (ADR-0023), and an unscoped key
 * would leak one persona's "I already saw this" state into another persona's session the moment
 * the demo switches personas without clearing storage — the same class of leak the session
 * guard/query-cache invalidation elsewhere in this codebase already exists to prevent for
 * server-held state. `readLocalPreference`/`writeLocalPreference` take the already-scoped key
 * rather than building it, so the scoping is visible at each call site instead of hidden in here.
 */
export function readLocalPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Same as above: the preference just does not persist across reloads.
  }
}
