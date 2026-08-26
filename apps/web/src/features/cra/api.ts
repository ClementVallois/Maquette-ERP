import { apiFetch, type ApiResult } from '@/lib/api-client';

import type {
  CalendarResponse,
  CraGridResponse,
  CraListResponse,
  ManagerCraGridResponse,
  MonthEntriesRequest,
  MonthEntriesResponse,
} from './types';

/**
 * The fetch functions for `Annexe A — Timesheet`'s read/write endpoints this phase consumes.
 * Never called from a component directly (`docs/frontend-plan.md` §2) — `hooks.ts` is the only
 * caller, same pattern as `features/session/api.ts`.
 */

const DEFAULT_LIST_LIMIT = 50;

export function fetchCraList(): Promise<ApiResult<CraListResponse>> {
  return apiFetch<CraListResponse>(`/api/v1/cras?limit=${String(DEFAULT_LIST_LIMIT)}`);
}

export function fetchCraGrid(period: string): Promise<ApiResult<CraGridResponse>> {
  return apiFetch<CraGridResponse>(`/api/v1/cras/${period}/grid`);
}

/** ADR-0071 — a manager's read of a named consultant's month, read-only. */
export function fetchManagerCraGrid(
  consultantId: string,
  period: string,
): Promise<ApiResult<ManagerCraGridResponse>> {
  return apiFetch<ManagerCraGridResponse>(
    `/api/v1/consultants/${consultantId}/cras/${period}/grid`,
  );
}

/** The working calendar's own coverage (ADR-0004) — what bounds the "open a future month" picker. */
export function fetchCalendar(): Promise<ApiResult<CalendarResponse>> {
  return apiFetch<CalendarResponse>('/api/v1/calendar');
}

export function saveMonth(
  period: string,
  body: MonthEntriesRequest,
): Promise<ApiResult<MonthEntriesResponse>> {
  return apiFetch<MonthEntriesResponse>(`/api/v1/cras/${period}/entries`, {
    method: 'PUT',
    body,
  });
}
