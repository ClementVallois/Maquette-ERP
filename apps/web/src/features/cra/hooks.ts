import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchCraGrid, fetchCraList, saveMonth } from './api';
import type {
  CraGridResponse,
  CraListResponse,
  MonthEntriesRequest,
  MonthEntriesResponse,
} from './types';

const CRA_LIST_QUERY_KEY = ['cra', 'list'] as const;

function craGridQueryKey(period: string): readonly [string, string, string] {
  return ['cra', 'grid', period] as const;
}

export const craListQueryOptions = queryOptions({
  queryKey: CRA_LIST_QUERY_KEY,
  queryFn: async () => unwrap(await fetchCraList()),
});

export function useCraList(): UseQueryResult<CraListResponse> {
  return useQuery(craListQueryOptions);
}

export function craGridQueryOptions(period: string) {
  return queryOptions({
    queryKey: craGridQueryKey(period),
    queryFn: async () => unwrap(await fetchCraGrid(period)),
    // A background refetch on window focus would silently overwrite the consultant's unsaved
    // in-memory edits with the server's last-saved shape (`CraGridBody`'s own render-time
    // re-sync, ADR-0067) — safe for a read-only screen, a real data-loss risk for an editable
    // one. `lib/query-client.ts`'s global default stays untouched; this is the one query where
    // it would be actively wrong.
    refetchOnWindowFocus: false,
  });
}

export function useCraGrid(period: string): UseQueryResult<CraGridResponse> {
  return useQuery(craGridQueryOptions(period));
}

/**
 * ADR-0067: refetch-driven, not optimistic. On success this invalidates the grid's own query (so
 * the screen's in-memory slot state is rebuilt from the server's answer, which lines exist and how
 * they group — `PUT`'s response carries no `lines` to have predicted correctly) and the list's
 * query (a first save on a period with no prior Cra changes `GET /api/v1/cras`' row count).
 */
export function useSaveMonth(
  period: string,
): UseMutationResult<MonthEntriesResponse, Error, MonthEntriesRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: MonthEntriesRequest) => unwrap(await saveMonth(period, body)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: craGridQueryKey(period) }),
        queryClient.invalidateQueries({ queryKey: CRA_LIST_QUERY_KEY }),
      ]);
    },
  });
}
