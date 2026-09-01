import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchInvoiceDetail, fetchInvoiceList, postIssuance } from './api';
import type { InvoiceDetail, InvoiceListResponse, IssuanceResponse } from './types';

function invoiceListQueryKey(): readonly [string] {
  return ['factures'] as const;
}

export function invoiceListQueryOptions() {
  return queryOptions({
    queryKey: invoiceListQueryKey(),
    queryFn: async () => unwrap(await fetchInvoiceList()),
  });
}

export function useInvoiceList(): UseQueryResult<InvoiceListResponse> {
  return useQuery(invoiceListQueryOptions());
}

function invoiceDetailQueryKey(id: string): readonly [string, string] {
  return ['facture', id] as const;
}

export function invoiceDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: invoiceDetailQueryKey(id),
    queryFn: async () => unwrap(await fetchInvoiceDetail(id)),
  });
}

export function useInvoiceDetail(id: string): UseQueryResult<InvoiceDetail> {
  return useQuery(invoiceDetailQueryOptions(id));
}

interface IssueVariables {
  readonly invoiceId: string;
  readonly idempotencyKey: string;
}

/**
 * Task 8.3. Issuing changes the invoiced document (its own detail read) **and** the list's status
 * badge/number/TTC for that row — both queries are invalidated rather than patched by hand, same
 * reasoning `features/cra/hooks.ts`'s `useValidateCra` already gives for its own affected reads.
 */
export function useIssueInvoice(): UseMutationResult<IssuanceResponse, Error, IssueVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, idempotencyKey }: IssueVariables) =>
      unwrap(await postIssuance(invoiceId, idempotencyKey)),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invoiceListQueryKey() }),
        queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(variables.invoiceId) }),
      ]);
    },
  });
}
