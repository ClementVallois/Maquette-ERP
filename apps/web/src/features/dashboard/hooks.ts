import { queryOptions, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchDashboard, fetchTeam } from './api';
import type { DashboardResponse, TeamResponse } from './types';

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
 * dashboard's own displayed period (`fetchTeam`'s own comment). */
export function teamQueryOptions() {
  return queryOptions({
    queryKey: ['team'] as const,
    queryFn: async () => unwrap(await fetchTeam()),
  });
}

export function useTeam(): UseQueryResult<TeamResponse> {
  return useQuery(teamQueryOptions());
}
