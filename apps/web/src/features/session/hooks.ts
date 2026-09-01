import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { clearPersona, fetchPersonas, fetchSession, selectPersona } from './api';
import type { PersonasResponse, SelectPersonaResponse, SessionResponse } from './types';

/**
 * `useSession` is what the shell and the guards (Phase 4) consume — one hook, one query key.
 * A persona change invalidates the whole cache rather than this key alone (see
 * `invalidateOnPersonaChange` below), so `beforeLoad`'s `ensureQueryData` below always refetches
 * rather than trusting a session this key held for a persona that just stopped being current.
 */
const SESSION_QUERY_KEY = ['session'] as const;
const PERSONAS_QUERY_KEY = ['personas'] as const;

/**
 * Exported so `routes/_shell.tsx`'s `beforeLoad` can call
 * `context.queryClient.ensureQueryData(sessionQueryOptions)` against the exact same query key
 * `useSession` reads — one cache entry, read from two places, rather than a second key the guard
 * would own and the mutation below would have to remember to invalidate as well.
 */
export const sessionQueryOptions = queryOptions({
  queryKey: SESSION_QUERY_KEY,
  queryFn: async () => unwrap(await fetchSession()),
});

export function useSession(): UseQueryResult<SessionResponse> {
  return useQuery(sessionQueryOptions);
}

export function usePersonas(): UseQueryResult<PersonasResponse> {
  return useQuery({
    queryKey: PERSONAS_QUERY_KEY,
    queryFn: async () => unwrap(await fetchPersonas()),
  });
}

/**
 * Both mutations below change which persona a query key like `['dashboard', period]` or
 * `['cra', 'list']` resolves to server-side, without the key itself changing — none of them carry
 * a persona/role/office component (`lib/query-client.ts`'s `staleTime: 30_000` is exactly what
 * would otherwise keep serving a stale answer for up to thirty seconds). Every cached query has to
 * be treated as belonging to the persona that is about to stop being current, and this has to hold
 * for two different kinds of observer:
 *
 * - **Active** (a component is still mounted and subscribed at this instant — the persona grid
 *   itself, for the one frame before `navigate()` lands): `invalidateQueries()` marks it stale
 *   *without* deleting its data, so that observer keeps rendering what it already has instead of
 *   dropping to `isPending` and flashing its skeleton (QA round 1, item 2). For `useSelectPersona`,
 *   its own background refetch (the default `refetchType: 'active'`) runs against the cookie the
 *   mutation just set, so what it re-renders with is already the new persona's answer.
 * - **Inactive** (no component subscribed right now, but the cache entry survives — the dashboard
 *   query after navigating away from it, waiting to be reused the next time that route mounts):
 *   `invalidateQueries()` alone marks it stale but does not refetch it (`refetchType: 'active'` is
 *   the default), so a later remount would find `isPending: false` and paint the *previous*
 *   persona's cached rows before the background refetch replaces them — worse than a skeleton, in
 *   an app whose whole point is authorization by role and scope. `removeQueries` drops those
 *   outright, so a remount has nothing cached to paint and genuinely fetches under the new persona.
 *
 * `refetchType` is the one place the two mutations below deliberately differ (item 9, QA round 2).
 * `useMutation`'s hook-level `onSuccess` (this function, called from both) runs *before* either
 * call site's own `onSuccess` — where `navigate()` actually lives (`PersonaBlock.handleChange`,
 * `routes/index.tsx`'s `choose`) — so whichever screen triggered the mutation is still mounted,
 * with its own persona-scoped query still active, at the exact moment this runs. For
 * `useSelectPersona` an active refetch there succeeds (the new cookie is already set) and is what
 * the previous paragraph's "already the new persona's answer" describes. For `useClearPersona` no
 * cookie is set at all — an active refetch of, say, the dashboard query the manager was just
 * looking at is *guaranteed* to fail, and `session-guard.ts`'s global cache-error subscription
 * reacts to that failure with `window.location.assign('/')`: a genuine hard reload landing on top
 * of the `navigate({ to: '/' })` already in flight, which is what produced the reported
 * skeleton → blank screen → skeleton → real-content sequence (confirmed live: a `doc-request`
 * network event and a second `load` event, not just a second render, both firing after the
 * client-side navigation had already landed on `/`). `refetchType: 'none'` on the clear path marks
 * everything stale without refetching anything synchronously — no active query, no doomed request,
 * no reload. Nothing here depends on that refetch actually happening: `/` reads only
 * `usePersonas()`, which is public and unaffected by the persona cookie either way.
 *
 * Neither call needs a per-feature key list — both default to matching every query — so this stays
 * the one place that has to know the shape of every feature's cache, not one entry per feature.
 */
function invalidateOnPersonaChange(
  queryClient: ReturnType<typeof useQueryClient>,
  refetchType: 'active' | 'none',
): void {
  void queryClient.invalidateQueries({ refetchType });
  queryClient.removeQueries({ type: 'inactive' });
}

export function useSelectPersona(): UseMutationResult<SelectPersonaResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) => unwrap(await selectPersona(key)),
    onSuccess: () => {
      invalidateOnPersonaChange(queryClient, 'active');
    },
  });
}

export function useClearPersona(): UseMutationResult<SessionResponse, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => unwrap(await clearPersona()),
    onSuccess: () => {
      invalidateOnPersonaChange(queryClient, 'none');
    },
  });
}
