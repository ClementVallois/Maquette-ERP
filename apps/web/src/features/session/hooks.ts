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
 *   dropping to `isPending` and flashing its skeleton (QA round 1, item 2). Its own background
 *   refetch runs against the cookie the mutation just set, so what it re-renders with is already
 *   the new persona's answer.
 * - **Inactive** (no component subscribed right now, but the cache entry survives — the dashboard
 *   query after navigating away from it, waiting to be reused the next time that route mounts):
 *   `invalidateQueries()` alone marks it stale but does not refetch it (`refetchType: 'active'` is
 *   the default), so a later remount would find `isPending: false` and paint the *previous*
 *   persona's cached rows before the background refetch replaces them — worse than a skeleton, in
 *   an app whose whole point is authorization by role and scope. `removeQueries` drops those
 *   outright, so a remount has nothing cached to paint and genuinely fetches under the new persona.
 *
 * Neither call needs a per-feature key list — both default to matching every query — so this stays
 * the one place that has to know the shape of every feature's cache, not one entry per feature.
 */
function invalidateOnPersonaChange(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries();
  queryClient.removeQueries({ type: 'inactive' });
}

export function useSelectPersona(): UseMutationResult<SelectPersonaResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) => unwrap(await selectPersona(key)),
    onSuccess: () => {
      invalidateOnPersonaChange(queryClient);
    },
  });
}

export function useClearPersona(): UseMutationResult<SessionResponse, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => unwrap(await clearPersona()),
    onSuccess: () => {
      invalidateOnPersonaChange(queryClient);
    },
  });
}
