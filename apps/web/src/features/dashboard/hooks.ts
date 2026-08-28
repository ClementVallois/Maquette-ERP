import { queryOptions, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchDashboard } from './api';
import type { DashboardResponse } from './types';

export function dashboardQueryOptions(period: string) {
  return queryOptions({
    queryKey: ['dashboard', period] as const,
    queryFn: async () => unwrap(await fetchDashboard(period)),
  });
}

export function useDashboard(period: string): UseQueryResult<DashboardResponse> {
  return useQuery(dashboardQueryOptions(period));
}
