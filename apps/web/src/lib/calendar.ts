import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { apiFetch, unwrap, type ApiResult } from './api-client';

/** `GET /api/v1/calendar` — the working calendar's own year coverage (ADR-0004). */
export interface CalendarResponse {
  readonly years: readonly number[];
}

/** The working calendar's own coverage (ADR-0004) — what bounds the "open a future month" picker. */
export function fetchCalendar(): Promise<ApiResult<CalendarResponse>> {
  return apiFetch<CalendarResponse>('/api/v1/calendar');
}

const CALENDAR_QUERY_KEY = ['calendar'] as const;

/**
 * Item 4, QA round 6: moved out of `features/cra` so `features/factures`' own year filter
 * (`invoice-list-screen.tsx`) does not gain a dependency on `features/cra` — the repository
 * documents exactly one cross-feature import (`cra → factures`) and this would have been a
 * second. Neutral, alongside `query-client.ts` and `use-reduced-motion.ts`.
 *
 * The working calendar's own year coverage (ADR-0004) — bounds the "open a future month"/year
 * pickers. Effectively static within a session (the calendar table is code, not data), so the
 * default `staleTime` is left alone rather than tuned per query.
 */
export function useCalendar(): UseQueryResult<CalendarResponse> {
  return useQuery({
    queryKey: CALENDAR_QUERY_KEY,
    queryFn: async () => unwrap(await fetchCalendar()),
  });
}
