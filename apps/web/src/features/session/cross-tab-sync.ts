import type { QueryClient } from '@tanstack/react-query';

/**
 * Both `hooks.ts` mutations (`useSelectPersona`, `useClearPersona`) and this module's own
 * cross-tab listener below all end up here: every one of them changes which persona a query key
 * like `['dashboard', period]` or `['cra', 'list']` resolves to server-side, without the key
 * itself changing — none of them carry a persona/role/office component
 * (`lib/query-client.ts`'s `staleTime: 30_000` is exactly what would otherwise keep serving a
 * stale answer for up to thirty seconds). Every cached query has to be treated as belonging to
 * the persona that is about to stop being current, and this has to hold for two different kinds
 * of observer:
 *
 * - **Active** (a component is still mounted and subscribed at this instant — the persona grid
 *   itself, for the one frame before `navigate()` lands): `invalidateQueries()` marks it stale
 *   *without* deleting its data, so that observer keeps rendering what it already has instead of
 *   dropping to `isPending` and flashing its skeleton. With `refetchType:
 *   'active'`, the background refetch this triggers runs against whatever the cookie now says, so
 *   what the observer re-renders with is already the new persona's answer.
 * - **Inactive** (no component subscribed right now, but the cache entry survives — the dashboard
 *   query after navigating away from it, waiting to be reused the next time that route mounts):
 *   `invalidateQueries()` alone marks it stale but does not refetch it (`refetchType: 'active'` is
 *   the default), so a later remount would find `isPending: false` and paint the *previous*
 *   persona's cached rows before the background refetch replaces them — worse than a skeleton, in
 *   an app whose whole point is authorization by role and scope. `removeQueries` drops those
 *   outright, so a remount has nothing cached to paint and genuinely fetches under the new persona.
 *
 * `refetchType` is the one place callers deliberately differ (see this module's own comment on
 * `installCrossTabPersonaSync` below). `useMutation`'s hook-level
 * `onSuccess` runs *before* either call site's own `onSuccess` — where `navigate()` actually lives
 * (`PersonaBlock.handleChange`, `routes/index.tsx`'s `choose`) — so whichever screen triggered the
 * mutation is still mounted, with its own persona-scoped query still active, at the exact moment
 * this runs. For `useSelectPersona` an active refetch there succeeds (the new cookie is already
 * set) and is what the previous paragraph's "already the new persona's answer" describes. For
 * `useClearPersona` no cookie is set at all — an active refetch of, say, the dashboard query the
 * manager was just looking at is *guaranteed* to fail, and `session-guard.ts`'s global
 * cache-error subscription reacts to that failure with `window.location.assign('/')`: a genuine
 * hard reload landing on top of the `navigate({ to: '/' })` already in flight, which is what
 * produced the reported skeleton → blank screen → skeleton → real-content sequence (confirmed
 * live: a `doc-request` network event and a second `load` event, not just a second render, both
 * firing after the client-side navigation had already landed on `/`). `refetchType: 'none'` on
 * the clear path marks everything stale without refetching anything synchronously — no active
 * query, no doomed request, no reload. Nothing here depends on that refetch actually happening:
 * `/` reads only `usePersonas()`, which is public and unaffected by the persona cookie either way.
 *
 * Neither call needs a per-feature key list — both default to matching every query — so this
 * stays the one place that has to know the shape of every feature's cache, not one entry per
 * feature.
 */
export function invalidateOnPersonaChange(
  queryClient: QueryClient,
  refetchType: 'active' | 'none',
): void {
  // Cancel *before* invalidate: `invalidateQueries`'s own refetch only cancels-and-restarts an
  // already in-flight fetch when the query already holds settled data — `query-core`'s
  // `Query.fetch()` gates its `cancelRefetch` branch on `state.data !== undefined`. A query still
  // on its very first, never-yet-settled fetch when the persona changes has no data to gate on,
  // so without this line `invalidateQueries` would silently piggyback on that same in-flight
  // fetch instead of starting a new one — and whatever it eventually resolves to, built under the
  // persona that is not current any more, becomes the query's data uncontested.
  // `cross-tab-sync.test.ts`'s "delayed response held open" case fails without this line.
  // `cancelQueries()` has no such gate — it calls `query.cancel()` directly on every query
  // regardless of whether it has ever settled, discarding the in-flight fetch's eventual
  // resolution (query-core's own `isResolved` guard, read directly off `retryer.ts`) and
  // reverting to pre-fetch state, so the fetch `invalidateQueries` triggers next always starts
  // genuinely fresh rather than reusing one already running.
  void queryClient.cancelQueries();
  void queryClient.invalidateQueries({ refetchType });
  queryClient.removeQueries({ type: 'inactive' });
}

/**
 * How another tab changing the shared cookie invalidates this tab's cached persona and business
 * data. A second same-origin tab has its own independent `QueryClient` and its own mounted
 * queries, and
 * the only thing it shares with the tab that just switched persona is `document.cookie`, which
 * neither tab's cache is watching. `localStorage`'s `storage` event is the browser primitive built
 * for exactly this: writing a key fires `storage` in every OTHER same-origin document with that
 * storage open — never in the writer itself, a platform guarantee, not a filter this code adds —
 * which is what makes it usable as a one-way broadcast between tabs that otherwise know nothing
 * about each other. See `docs/adr/0112-persona-changes-broadcast-across-tabs-through-storage.md`.
 */
export const PERSONA_CHANGE_STORAGE_KEY = 'erp:persona-changed-at';

/**
 * Called once, from inside the mutation's own `onSuccess` (`hooks.ts`'s `useSelectPersona` and
 * `useClearPersona`) — never from `installCrossTabPersonaSync`'s own listener below. A listening
 * tab that reacted to a broadcast must not re-broadcast, or two open tabs would ping-pong this key
 * back and forth indefinitely (tab A writes → tab B's listener fires → if reacting also wrote,
 * tab A's listener would fire next → …). Only the tab that actually ran the mutation calls this;
 * every other tab only ever reads.
 *
 * `writeTimestamp` exists so tests can substitute a plain recording function for the real
 * `localStorage.setItem` — this repository's vitest projects run in Vitest's default `node`
 * environment (no `window`/`localStorage` global at all; nothing before this module needed one),
 * and adding a DOM environment purely to exercise one line of storage-writing would be new test
 * infrastructure for a browser primitive this file's own tests can substitute directly instead,
 * the same seam `session-guard.ts`'s `installSessionGuard` already takes for
 * `window.location.assign` via its own injectable `redirectToSelector` parameter.
 */
export function broadcastPersonaChange(
  writeTimestamp: (value: string) => void = (value) => {
    try {
      localStorage.setItem(PERSONA_CHANGE_STORAGE_KEY, value);
    } catch {
      // Storage disabled (private browsing, quota) means this tab cannot tell any other tab about
      // its own change. Best-effort, the same posture `session-guard.ts`'s own comments already
      // take toward a persona cookie that "may already be gone server-side": nothing this module
      // does can make a browser's storage available, so it degrades to "no cross-tab sync" rather
      // than throwing out of a mutation's own onSuccess.
    }
  },
): void {
  writeTimestamp(String(Date.now()));
}

/** The one fact this module reads off a real `StorageEvent` — kept this narrow so a test can pass
 * a plain object instead of needing a `StorageEvent` constructor, which Vitest's `node`
 * environment does not provide either (see `broadcastPersonaChange`'s own comment). */
export interface PersonaBroadcastEvent {
  readonly key: string | null;
}

/**
 * Wired once from `App.tsx`, alongside `installSessionGuard`. Reacting with `refetchType: 'active'`
 * unconditionally — rather than trying to recover whether the origin tab selected or cleared a
 * persona from this event alone, which a `storage` event's `newValue` timestamp cannot say — is
 * deliberate: unlike the origin tab's own `useClearPersona` (which deliberately refetches nothing
 * synchronously, `refetchType: 'none'`, to avoid racing its own in-flight `navigate()` — see
 * `invalidateOnPersonaChange`'s own comment above), a tab reacting to a broadcast has no competing
 * navigation of its own in flight this tick. Its active session query simply refetches into
 * whatever the cookie now says (`{ persona: null }` on a clear is a normal 200, not a refusal),
 * and every other active business query either succeeds under the new persona or fails and
 * reaches `session-guard.ts`'s existing redirect handling exactly as if this tab's own fetch had
 * failed that way — no second code path to keep in sync with the first.
 *
 * `subscribe` is the same test seam as `broadcastPersonaChange`'s `writeTimestamp`: it takes a
 * plain listener and returns an unsubscribe function, so a test can hand this a fake that calls
 * the listener directly instead of needing a real `window` and a real `StorageEvent`.
 */
export function installCrossTabPersonaSync(
  queryClient: QueryClient,
  subscribe: (listener: (event: PersonaBroadcastEvent) => void) => () => void = (listener) => {
    const handler = (event: StorageEvent): void => {
      listener(event);
    };
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('storage', handler);
    };
  },
): () => void {
  return subscribe((event) => {
    if (event.key !== PERSONA_CHANGE_STORAGE_KEY) return;
    invalidateOnPersonaChange(queryClient, 'active');
  });
}
