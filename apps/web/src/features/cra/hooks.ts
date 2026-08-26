import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchCalendar, fetchCraGrid, fetchCraList, fetchManagerCraGrid, saveMonth } from './api';
import type {
  CalendarResponse,
  CraGridResponse,
  CraListResponse,
  ManagerCraGridResponse,
  MonthEntriesRequest,
  MonthEntriesResponse,
} from './types';

const CRA_LIST_QUERY_KEY = ['cra', 'list'] as const;
const CALENDAR_QUERY_KEY = ['cra', 'calendar'] as const;

function craGridQueryKey(period: string): readonly [string, string, string] {
  return ['cra', 'grid', period] as const;
}

function managerCraGridQueryKey(
  consultantId: string,
  period: string,
): readonly [string, string, string, string] {
  return ['cra', 'manager-grid', consultantId, period] as const;
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

/** ADR-0071 — a manager's read of a named consultant's month. Read-only, so window-focus refetch
 * carries none of `craGridQueryOptions`'s data-loss risk and stays on the global default. */
export function useManagerCraGrid(
  consultantId: string,
  period: string,
): UseQueryResult<ManagerCraGridResponse> {
  return useQuery({
    queryKey: managerCraGridQueryKey(consultantId, period),
    queryFn: async () => unwrap(await fetchManagerCraGrid(consultantId, period)),
  });
}

/** The working calendar's own year coverage (ADR-0004) — bounds the "open a future month" picker.
 * Effectively static within a session (the calendar table is code, not data), so the default
 * `staleTime` is left alone rather than tuned per query. */
export function useCalendar(): UseQueryResult<CalendarResponse> {
  return useQuery({
    queryKey: CALENDAR_QUERY_KEY,
    queryFn: async () => unwrap(await fetchCalendar()),
  });
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
