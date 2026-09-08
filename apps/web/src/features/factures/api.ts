import { apiFetch, type ApiResult } from '@/lib/api-client';

import type {
  InvoiceDetail,
  InvoiceHistoryResponse,
  InvoiceListResponse,
  IssuanceResponse,
} from './types';

/**
 * The fetch functions for the invoice endpoints. Never called from a component directly —
 * `hooks.ts` is the only caller.
 */

export interface InvoiceListFilters {
  readonly status?: string;
  readonly year?: number;
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

export function fetchInvoiceList(
  filters: InvoiceListFilters,
  signal?: AbortSignal,
): Promise<ApiResult<InvoiceListResponse>> {
  const params = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
  });
  if (filters.status !== undefined) params.set('status', filters.status);
  if (filters.year !== undefined) params.set('year', String(filters.year));
  if (filters.search !== undefined && filters.search !== '') params.set('search', filters.search);

  return apiFetch<InvoiceListResponse>(`/api/v1/invoices?${params.toString()}`, { signal });
}

export function fetchInvoiceDetail(
  id: string,
  signal?: AbortSignal,
): Promise<ApiResult<InvoiceDetail>> {
  return apiFetch<InvoiceDetail>(`/api/v1/invoices/${id}`, { signal });
}

/**
 * Task 8.3 — the header name is lower-case to match the server's own constant
 * (`IDEMPOTENCY_KEY_HEADER`, `apps/api/src/routes/api.ts`) even though HTTP header names are
 * case-insensitive on the wire; matching it exactly is one fewer thing to double-check when
 * reading the two sides side by side.
 */
export function postIssuance(
  invoiceId: string,
  idempotencyKey: string,
): Promise<ApiResult<IssuanceResponse>> {
  return apiFetch<IssuanceResponse>(`/api/v1/invoices/${invoiceId}/issuance`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
  });
}

/** Rank A2's history chart — manager/billing only, `forRoles('manager', 'billing')` on the API. */
export function fetchInvoiceHistory(
  signal?: AbortSignal,
): Promise<ApiResult<InvoiceHistoryResponse>> {
  return apiFetch<InvoiceHistoryResponse>('/api/v1/invoices/history', { signal });
}
