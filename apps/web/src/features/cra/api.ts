import { apiFetch, type ApiResult } from '@/lib/api-client';

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

/**
 * The fetch functions for `Annexe A — Timesheet`'s read/write endpoints this phase consumes.
 * Never called from a component directly (`docs/frontend-plan.md` §2) — `hooks.ts` is the only
 * caller, same pattern as `features/session/api.ts`.
 */

/**
 * 200, not 50 — moves with `apps/api/src/routes/api.ts`'s `CRA_LIST_MAX_PAGE_SIZE` (ADR-0081,
 * item 6/step 3 QA round 1): the manager's CRA list has no pagination control in this UI, so
 * whatever this constant asks for is the whole page a manager ever sees, and it has to clear the
 * route's own cap or a manager past the old 50-row default would see a page silently short of
 * their office's real count again, one layer up.
 */
const DEFAULT_LIST_LIMIT = 20;

export interface CraListFilters {
  readonly consultantIds?: readonly string[];
  readonly statuses?: readonly string[];
  /** Item 4 (QA round 2): independent of each other and of `consultantIds`/`statuses` above —
   * matches `apps/api/src/routes/api.ts`'s own `year`/`month` query params. */
  readonly year?: number;
  readonly month?: number;
  readonly limit?: number;
  readonly offset?: number;
}

/** Comma-separated, matching `apps/api/src/routes/api.ts`'s own `CommaSeparatedIds`/
 * `CommaSeparatedStatuses` — an empty/absent list adds no query param at all rather than one
 * whose value is the empty string, so "no filter" and "filtered to nothing" stay distinguishable
 * on the wire. */
export function fetchCraList(filters: CraListFilters = {}): Promise<ApiResult<CraListResponse>> {
  const params = new URLSearchParams({
    limit: String(filters.limit ?? DEFAULT_LIST_LIMIT),
    offset: String(filters.offset ?? 0),
  });
  if (filters.consultantIds !== undefined && filters.consultantIds.length > 0) {
    params.set('consultantIds', filters.consultantIds.join(','));
  }
  if (filters.statuses !== undefined && filters.statuses.length > 0) {
    params.set('statuses', filters.statuses.join(','));
  }
  if (filters.year !== undefined) {
    params.set('year', String(filters.year));
  }
  if (filters.month !== undefined) {
    params.set('month', String(filters.month));
  }

  return apiFetch<CraListResponse>(`/api/v1/cras?${params.toString()}`);
}

/** Item 7 (QA round 1) — the consultant filter's own option list (`features/cra/hooks.ts`'s
 * `useConsultantRoster` explains why it is a separate read from the list itself). */
export function fetchConsultantRoster(): Promise<ApiResult<ConsultantRosterResponse>> {
  return apiFetch<ConsultantRosterResponse>('/api/v1/consultants');
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
