import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { DashboardResponse } from './types';

/**
 * `GET /api/v1/dashboard?period=` (task 8.4). `period` is a required query parameter with no
 * server-side default (confirmed live: a bare request answers `400 malformed-request`) — every
 * caller of this function already has one, either the route's own `beforeLoad` default
 * (`lib/period.ts`'s `currentPeriod()`) or a value the visitor picked.
 */
export function fetchDashboard(period: string): Promise<ApiResult<DashboardResponse>> {
  return apiFetch<DashboardResponse>(`/api/v1/dashboard?period=${encodeURIComponent(period)}`);
}
