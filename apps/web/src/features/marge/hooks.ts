import { queryOptions, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchConsultantEconomics } from './api';
import type { ConsultantEconomics } from './types';

/**
 * Each read is a disclosure the server logs (ADR-0052) — `staleTime: 0`, the query's own default,
 * is left alone rather than cached long: a screen reached by a fresh, explicit click each time
 * (§7.5, never a hover) should not silently serve a previous log entry's answer on a second visit
 * without a new request, or the "chaque ouverture est journalisée" claim on the screen itself
 * (`LABELS.margin.lead`) would describe a log line that did not happen.
 */
export function useConsultantEconomics(
  consultantId: string,
  period: string,
): UseQueryResult<ConsultantEconomics> {
  return useQuery(
    queryOptions({
      queryKey: ['marge', consultantId, period] as const,
      queryFn: async () => unwrap(await fetchConsultantEconomics(consultantId, period)),
      staleTime: 0,
    }),
  );
}
