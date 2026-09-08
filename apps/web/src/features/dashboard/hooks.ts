import { queryOptions, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchDashboard, fetchOrgChart } from './api';
import type { DashboardResponse, OrgChartResponse } from './types';

export function dashboardQueryOptions(period: string) {
  return queryOptions({
    queryKey: ['dashboard', period] as const,
    queryFn: async ({ signal }) => unwrap(await fetchDashboard(period, signal)),
  });
}

export function useDashboard(period: string): UseQueryResult<DashboardResponse> {
  return useQuery(dashboardQueryOptions(period));
}

/** No `period` in the key: the org chart is read as of today, not as of the
 * dashboard's own displayed period (`fetchOrgChart`'s own comment). */
export function orgChartQueryOptions() {
  return queryOptions({
    queryKey: ['org-chart'] as const,
    queryFn: async ({ signal }) => unwrap(await fetchOrgChart(signal)),
  });
}

export function useOrgChart(): UseQueryResult<OrgChartResponse> {
  return useQuery(orgChartQueryOptions());
}
