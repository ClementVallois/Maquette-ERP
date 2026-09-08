import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { clearPersona, fetchPersonas, fetchSession, selectPersona } from './api';
import { broadcastPersonaChange, invalidateOnPersonaChange } from './cross-tab-sync';
import type { PersonasResponse, SelectPersonaResponse, SessionResponse } from './types';

/**
 * `useSession` is what the shell and the route guards consume — one hook, one query key.
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
  queryFn: async ({ signal }) => unwrap(await fetchSession(signal)),
});

export function useSession(): UseQueryResult<SessionResponse> {
  return useQuery(sessionQueryOptions);
}

export function usePersonas(): UseQueryResult<PersonasResponse> {
  return useQuery({
    queryKey: PERSONAS_QUERY_KEY,
    queryFn: async ({ signal }) => unwrap(await fetchPersonas(signal)),
  });
}

/**
 * Both mutations below change which persona a query key like `['dashboard', period]` or
 * `['cra', 'list']` resolves to server-side, without the key itself changing — the reasoning for
 * `invalidateOnPersonaChange`'s two-branch `refetchType` is written once, on that function itself
 * (`cross-tab-sync.ts`, next to the cross-tab listener that shares it).
 *
 * `broadcastPersonaChange()` after each: this tab knows its persona changed (that is what
 * triggered `onSuccess`), but no other same-origin tab does, and the cookie is not something a
 * cache watches. Called from `onSuccess`
 * rather than from inside `invalidateOnPersonaChange` itself, so the listener that later reacts to
 * this broadcast in another tab can call the same invalidation function without re-broadcasting
 * and ping-ponging the two tabs forever — see that listener's own comment.
 */
export function useSelectPersona(): UseMutationResult<SelectPersonaResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) => unwrap(await selectPersona(key)),
    onSuccess: () => {
      invalidateOnPersonaChange(queryClient, 'active');
      broadcastPersonaChange();
    },
  });
}

export function useClearPersona(): UseMutationResult<SessionResponse, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => unwrap(await clearPersona()),
    onSuccess: () => {
      invalidateOnPersonaChange(queryClient, 'none');
      broadcastPersonaChange();
    },
  });
}
