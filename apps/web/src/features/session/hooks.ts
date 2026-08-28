import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { clearPersona, fetchPersonas, fetchSession, selectPersona } from './api';
import type { PersonasResponse, SelectPersonaResponse, SessionResponse } from './types';

/**
 * `useSession` is what the shell and the guards (Phase 4) consume — one hook, one query key.
 * A persona change clears the whole `QueryClient` rather than invalidating this key alone (see
 * `useSelectPersona`/`useClearPersona` below), so `beforeLoad`'s `ensureQueryData` below always
 * refetches a session there is no cache left to lie with.
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

export function useSelectPersona(): UseMutationResult<SelectPersonaResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) => unwrap(await selectPersona(key)),
    // `clear()`, not `invalidateQueries({ queryKey: SESSION_QUERY_KEY })`: every query in this SPA
    // is scoped by the persona cookie (`lib/query-client.ts`'s `staleTime: 30_000` otherwise keeps
    // serving the *previous* persona's cached CRA list, dashboard and grid for up to thirty
    // seconds). Invalidating one key per feature would need this file to grow in lockstep with
    // every feature added under `features/`; dropping the whole cache is the one fix that cannot
    // fall out of step with the feature list.
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useClearPersona(): UseMutationResult<SessionResponse, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => unwrap(await clearPersona()),
    // Same reasoning as `useSelectPersona` above — the identity acting changed (to none), so every
    // persona-scoped query cached under the old one is stale in a sense `staleTime` does not cover.
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
