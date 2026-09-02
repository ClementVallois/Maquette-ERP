import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import {
  fetchInvoiceDetail,
  fetchInvoiceHistory,
  fetchInvoiceList,
  type InvoiceListFilters,
  postIssuance,
} from './api';
import type {
  InvoiceDetail,
  InvoiceHistoryResponse,
  InvoiceListResponse,
  IssuanceResponse,
} from './types';

function invoiceListQueryKey(filters?: InvoiceListFilters) {
  return filters === undefined ? (['factures'] as const) : (['factures', filters] as const);
}

export function invoiceListQueryOptions(filters: InvoiceListFilters) {
  return queryOptions({
    queryKey: invoiceListQueryKey(filters),
    queryFn: async () => unwrap(await fetchInvoiceList(filters)),
  });
}

export function useInvoiceList(filters: InvoiceListFilters): UseQueryResult<InvoiceListResponse> {
  return useQuery(invoiceListQueryOptions(filters));
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

/** Rank A2 — no `period` argument: the history chart is fixed (2016→2026, three dense months), not
 * a view over the dashboard's own `?period=`, so it does not refetch when that changes. */
export function invoiceHistoryQueryOptions() {
  return queryOptions({
    queryKey: ['facture-historique'] as const,
    queryFn: async () => unwrap(await fetchInvoiceHistory()),
  });
}

export function useInvoiceHistory(): UseQueryResult<InvoiceHistoryResponse> {
  return useQuery(invoiceHistoryQueryOptions());
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
