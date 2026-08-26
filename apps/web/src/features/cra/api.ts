import { apiFetch, type ApiResult } from '@/lib/api-client';

import type {
  CalendarResponse,
  CraGridResponse,
  CraListResponse,
  ManagerCraGridResponse,
  MonthEntriesRequest,
  MonthEntriesResponse,
  RefusalResponse,
  ValidationResponse,
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

/**
 * Phase 7, task 7.2 — the manager's decision on a submitted month. Lives here rather than in
 * `features/pre-facturier`, the screen that first calls it: every `/api/v1/cras/*` fetch belongs
 * to this feature regardless of which screen triggers it, the same reasoning `saveMonth` above
 * already follows for the consultant's own write. `features/pre-facturier/hooks.ts` imports this
 * function (not a hook) and owns its own cache invalidation, so the crossing stays at the fetch
 * layer and `cra` never has to know a pré-facturier query key exists.
 */
export function postValidation(craId: string): Promise<ApiResult<ValidationResponse>> {
  return apiFetch<ValidationResponse>(`/api/v1/cras/${craId}/validation`, { method: 'POST' });
}

/** Phase 7, task 7.3 — the manager's refusal, `reason` 1-500 chars (the domain's own bound; this
 * function does not re-validate it, same division of labour as every other write in this file). */
export function postRefusal(craId: string, reason: string): Promise<ApiResult<RefusalResponse>> {
  return apiFetch<RefusalResponse>(`/api/v1/cras/${craId}/refusal`, {
    method: 'POST',
    body: { reason },
  });
}
