import { queryOptions, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchDashboard, fetchOrgChart } from './api';
import type { DashboardResponse, OrgChartResponse } from './types';

export function dashboardQueryOptions(period: string) {
  return queryOptions({
    queryKey: ['dashboard', period] as const,
    queryFn: async () => unwrap(await fetchDashboard(period)),
  });
}

export function useDashboard(period: string): UseQueryResult<DashboardResponse> {
  return useQuery(dashboardQueryOptions(period));
}

/** Item 18, QA round 3. No `period` in the key: the org chart is read as of today, not as of the
 * dashboard's own displayed period (`fetchOrgChart`'s own comment). */
export function orgChartQueryOptions() {
  return queryOptions({
    queryKey: ['org-chart'] as const,
    queryFn: async () => unwrap(await fetchOrgChart()),
  });
}

export function useOrgChart(): UseQueryResult<OrgChartResponse> {
  return useQuery(orgChartQueryOptions());
}
