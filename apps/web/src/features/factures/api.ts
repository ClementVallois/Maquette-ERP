import { apiFetch, type ApiResult } from '@/lib/api-client';

import type {
  InvoiceDetail,
  InvoiceHistoryResponse,
  InvoiceListResponse,
  IssuanceResponse,
} from './types';

/**
 * The fetch functions for `Annexe A — Billing`'s invoice endpoints (task 8.1-8.3). Never called
 * from a component directly (`docs/frontend-plan.md` §2) — `hooks.ts` is the only caller.
 */

/**
 * `GET /api/v1/invoices?limit&offset` has no `period` and no `status` query parameter — only
 * `Pagination` (confirmed against `apps/api/src/routes/api.ts`'s handler, rule 0bis.8). `limit=50`
 * is the API's own cap (`MAX_PAGE_SIZE`): one page, view-filtered by status client-side
 * (`invoice-list-screen.tsx`'s `Tabs`), the same "seed fits a page, no server-side filter to add"
 * reasoning `features/cra`'s list already used.
 */
const LIST_LIMIT = 50;

export function fetchInvoiceList(): Promise<ApiResult<InvoiceListResponse>> {
  return apiFetch<InvoiceListResponse>(`/api/v1/invoices?limit=${String(LIST_LIMIT)}`);
}

export function fetchInvoiceDetail(id: string): Promise<ApiResult<InvoiceDetail>> {
  return apiFetch<InvoiceDetail>(`/api/v1/invoices/${id}`);
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
export function fetchInvoiceHistory(): Promise<ApiResult<InvoiceHistoryResponse>> {
  return apiFetch<InvoiceHistoryResponse>('/api/v1/invoices/history');
}
