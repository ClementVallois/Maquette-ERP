import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateAfterIssueInvoice } from './hooks';

/**
 * Package 11's dependency table (`docs/adr/0113-mutations-invalidate-every-projection-they-
 * actually-change.md`): issuing an invoice flips its status from `draft` to `issued`, which
 * changes `apps/api/src/routes/invoices.ts`'s `byYearAndStatus` (invoice-history) and the billing
 * persona's own `draftInvoices`/`issuedInvoices`/`totalTtcIssuedCents` (dashboard) — neither was
 * invalidated before this package. Same `QueryObserver` technique as `cra/hooks.test.ts` and
 * `cross-tab-sync.test.ts`.
 */

function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function mountObserver(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): Promise<{ queryFn: ReturnType<typeof vi.fn>; unsubscribe: () => void }> {
  const queryFn = vi.fn(() => Promise.resolve('answer'));
  const observer = new QueryObserver(queryClient, { queryKey: [...queryKey], queryFn });
  const unsubscribe = observer.subscribe(() => undefined);
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().isSuccess).toBe(true);
  });
  return { queryFn, unsubscribe };
}

describe('invalidateAfterIssueInvoice', () => {
  it('refetches the invoice list/detail it already invalidated, plus dashboard and invoice-history', async () => {
    const queryClient = newQueryClient();
    const list = await mountObserver(queryClient, ['factures']);
    const detail = await mountObserver(queryClient, ['facture', 'inv-1']);
    const dashboard = await mountObserver(queryClient, ['dashboard', '2026-09']);
    const history = await mountObserver(queryClient, ['facture-historique']);

    await invalidateAfterIssueInvoice(queryClient, 'inv-1');

    await vi.waitFor(() => {
      expect(list.queryFn).toHaveBeenCalledTimes(2);
      expect(detail.queryFn).toHaveBeenCalledTimes(2);
      expect(dashboard.queryFn).toHaveBeenCalledTimes(2);
      expect(history.queryFn).toHaveBeenCalledTimes(2);
    });

    list.unsubscribe();
    detail.unsubscribe();
    dashboard.unsubscribe();
    history.unsubscribe();
  });
});
