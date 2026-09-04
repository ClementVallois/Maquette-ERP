import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { DashboardResponse, TeamResponse } from './types';

/**
 * `GET /api/v1/dashboard?period=` (task 8.4). `period` is a required query parameter with no
 * server-side default (confirmed live: a bare request answers `400 malformed-request`) — every
 * caller of this function already has one, either the route's own `beforeLoad` default
 * (`lib/period.ts`'s `currentPeriod()`) or a value the visitor picked.
 */
export function fetchDashboard(period: string): Promise<ApiResult<DashboardResponse>> {
  return apiFetch<DashboardResponse>(`/api/v1/dashboard?period=${encodeURIComponent(period)}`);
}

/** Item 18, QA round 3 — `GET /api/v1/team`, no query parameters (unlike the dashboard above,
 * the org chart is not read "as of" a period; it is read as of today). */
export function fetchTeam(): Promise<ApiResult<TeamResponse>> {
  return apiFetch<TeamResponse>('/api/v1/team');
}
