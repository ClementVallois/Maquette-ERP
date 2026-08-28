import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { postRefusal, postValidation } from '@/features/cra/api';
import type { RefusalResponse, ValidationResponse } from '@/features/cra/types';
import { unwrap } from '@/lib/api-client';

import { fetchPreFacturier } from './api';
import type { PreFacturierResponse } from './types';

function preFacturierQueryKey(period: string): readonly [string, string] {
  return ['pre-facturier', period] as const;
}

export function preFacturierQueryOptions(period: string) {
  return queryOptions({
    queryKey: preFacturierQueryKey(period),
    queryFn: async () => unwrap(await fetchPreFacturier(period)),
  });
}

export function usePreFacturier(period: string): UseQueryResult<PreFacturierResponse> {
  return useQuery(preFacturierQueryOptions(period));
}

/**
 * Task 7.2. `postValidation` is `features/cra/api.ts`'s (see its own comment for why); the
 * invalidation policy is this feature's own — a validated Cra changes its row's status, its
 * decidability, and drafts an invoice this screen's own table lists, so the whole pré-facturier
 * read for this period is refetched rather than patched field by field.
 */
export function useValidateCra(
  period: string,
): UseMutationResult<ValidationResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (craId: string) => unwrap(await postValidation(craId)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: preFacturierQueryKey(period) });
    },
  });
}

/** Task 7.3. Same invalidation reasoning as `useValidateCra` above. */
export function useRefuseCra(
  period: string,
): UseMutationResult<RefusalResponse, Error, { readonly craId: string; readonly reason: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ craId, reason }: { craId: string; reason: string }) =>
      unwrap(await postRefusal(craId, reason)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: preFacturierQueryKey(period) });
    },
  });
}
