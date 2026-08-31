import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import {
  type CraListFilters,
  fetchCalendar,
  fetchConsultantRoster,
  fetchCraGrid,
  fetchCraList,
  fetchManagerCraGrid,
  postRefusal,
  postValidation,
  saveMonth,
} from './api';
import type {
  CalendarResponse,
  ConsultantRosterResponse,
  CraGridResponse,
  CraListResponse,
  ManagerCraGridResponse,
  MonthEntriesRequest,
  MonthEntriesResponse,
  RefusalResponse,
  ValidationResponse,
} from './types';

const CRA_LIST_QUERY_KEY = ['cra', 'list'] as const;
const CALENDAR_QUERY_KEY = ['cra', 'calendar'] as const;
const CONSULTANT_ROSTER_QUERY_KEY = ['cra', 'consultant-roster'] as const;

/**
 * Item 7 (QA round 1): sorted, so `['a','b']` and `['b','a']` cache under the same entry rather
 * than one per order the filter happened to be built in — the two only ever differ by which
 * values are present, never by an order this SPA itself assigns meaning to.
 */
function craListQueryKey(
  filters: CraListFilters,
): readonly [...typeof CRA_LIST_QUERY_KEY, readonly string[], readonly string[]] {
  return [
    ...CRA_LIST_QUERY_KEY,
    [...(filters.consultantIds ?? [])].sort(),
    [...(filters.statuses ?? [])].sort(),
  ];
}

// Rebuilt here rather than imported: `features/pre-facturier/hooks.ts` keeps its own
// `preFacturierQueryKey` private for exactly this reason — see that file's comment. The two agree
// on the shape `['pre-facturier', period]` by convention; change one, change both.
function preFacturierQueryKey(period: string): readonly [string, string] {
  return ['pre-facturier', period] as const;
}

function craGridQueryKey(period: string): readonly [string, string, string] {
  return ['cra', 'grid', period] as const;
}

function managerCraGridQueryKey(
  consultantId: string,
  period: string,
): readonly [string, string, string, string] {
  return ['cra', 'manager-grid', consultantId, period] as const;
}

// Unparameterised on purpose: both mutations below can be triggered from the pré-facturier table
// (which knows no `consultantId` worth keying on beyond the row that just changed) or from the CRA
// detail screen (`features/cra/components/manager-cra-grid-screen.tsx`, item 3 of QA round 1,
// which does). Matching the whole `['cra', 'manager-grid']` prefix reaches whichever one of
// (possibly many) manager-grid queries is active without either caller having to say which.
const MANAGER_GRID_QUERY_KEY_PREFIX = ['cra', 'manager-grid'] as const;

/**
 * `filters` defaults to none, unlike `craGridQueryOptions`/`managerCraGridQueryKey` below, which
 * always take their parameter: `routes/_shell/pre-facturier.tsx`'s `beforeLoad` calls this with no
 * argument to read the office's own unfiltered list (computing the default period), and item 7's
 * filter controls (QA round 1) call it with one.
 */
export function craListQueryOptions(filters: CraListFilters = {}) {
  return queryOptions({
    queryKey: craListQueryKey(filters),
    queryFn: async () => unwrap(await fetchCraList(filters)),
  });
}

export function useCraList(filters: CraListFilters = {}): UseQueryResult<CraListResponse> {
  return useQuery(craListQueryOptions(filters));
}

/** Item 7 (QA round 1) — the consultant filter's own roster, independent of whichever page of
 * `/api/v1/cras` happens to be loaded (that route's own header explains why). Static within a
 * session in practice (the office roster does not change while a persona is picked), so this
 * stays on the global `staleTime` rather than a bespoke one, same reasoning `useCalendar` gives. */
export function useConsultantRoster(): UseQueryResult<ConsultantRosterResponse> {
  return useQuery({
    queryKey: CONSULTANT_ROSTER_QUERY_KEY,
    queryFn: async () => unwrap(await fetchConsultantRoster()),
  });
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

/**
 * Task 7.2. `postValidation` drafts an invoice this feature does not itself list — the two
 * callers each own the query that has to change: the pré-facturier table (whose row's status and
 * decidability just changed, and whose invoices table just gained a row), and, since item 3 (QA
 * round 1), the CRA detail screen a manager can now validate from directly. Invalidating all three
 * queries rather than tracking which caller needs which is the same reasoning
 * `features/session/hooks.ts`'s `invalidateOnPersonaChange` uses: cheaper than either caller
 * having to remember the other's cache key, and correct regardless of which one triggered it.
 */
export function useValidateCra(
  period: string,
): UseMutationResult<ValidationResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (craId: string) => unwrap(await postValidation(craId)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preFacturierQueryKey(period) }),
        queryClient.invalidateQueries({ queryKey: CRA_LIST_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: MANAGER_GRID_QUERY_KEY_PREFIX }),
      ]);
    },
  });
}

/** Task 7.3. Same invalidation reasoning as `useValidateCra` above. */
export function useRefuseCra(
  period: string,
): UseMutationResult<RefusalResponse, Error, { readonly craId: string; readonly reason: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ craId, reason }: { craId: string; reason: string }) =>
      unwrap(await postRefusal(craId, reason)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preFacturierQueryKey(period) }),
        queryClient.invalidateQueries({ queryKey: CRA_LIST_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: MANAGER_GRID_QUERY_KEY_PREFIX }),
      ]);
    },
  });
}
