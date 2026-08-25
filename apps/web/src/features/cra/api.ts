import { apiFetch, type ApiResult } from '@/lib/api-client';

import type {
  CraGridResponse,
  CraListResponse,
  MonthEntriesRequest,
  MonthEntriesResponse,
} from './types';

/**
 * The fetch functions for `Annexe A — Timesheet`'s three read/write endpoints this phase consumes.
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

export function saveMonth(
  period: string,
  body: MonthEntriesRequest,
): Promise<ApiResult<MonthEntriesResponse>> {
  return apiFetch<MonthEntriesResponse>(`/api/v1/cras/${period}/entries`, {
    method: 'PUT',
    body,
  });
}
