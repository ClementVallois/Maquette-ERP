import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  invalidateAfterRefuseCra,
  invalidateAfterSaveMonth,
  invalidateAfterValidateCra,
} from './hooks';

/**
 * Package 11's Work item: "write a small mutation-to-projection dependency table and encode the
 * corresponding query keys/invalidation helpers." The table itself, verified against
 * `apps/api/src/routes/dashboard.ts` and `apps/api/src/routes/invoices.ts`'s actual server-side
 * compositions rather than guessed, lives in
 * `docs/adr/0113-mutations-invalidate-every-projection-they-actually-change.md`; this file proves
 * each helper actually reaches the query it claims to.
 *
 * `QueryObserver` stands in for a mounted dashboard/history screen, the same technique
 * `cross-tab-sync.test.ts` already established for this exact class of question (does an
 * invalidation reach an active query) — no React, no `@testing-library/react`.
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

describe('invalidateAfterSaveMonth', () => {
  it('refetches the active dashboard query (consultant refusedPeriods/recentActivity)', async () => {
    const queryClient = newQueryClient();
    const dashboard = await mountObserver(queryClient, ['dashboard', '2026-09']);

    await invalidateAfterSaveMonth(queryClient, '2026-09');

    await vi.waitFor(() => {
      expect(dashboard.queryFn).toHaveBeenCalledTimes(2);
    });
    dashboard.unsubscribe();
  });
});

describe('invalidateAfterValidateCra', () => {
  it('refetches both the active dashboard and invoice-history queries', async () => {
    const queryClient = newQueryClient();
    const dashboard = await mountObserver(queryClient, ['dashboard', '2026-09']);
    const history = await mountObserver(queryClient, ['facture-historique']);

    await invalidateAfterValidateCra(queryClient, '2026-09');

    await vi.waitFor(() => {
      expect(dashboard.queryFn).toHaveBeenCalledTimes(2);
      expect(history.queryFn).toHaveBeenCalledTimes(2);
    });
    dashboard.unsubscribe();
    history.unsubscribe();
  });
});

describe('invalidateAfterRefuseCra', () => {
  it('refetches the active dashboard query but leaves invoice-history alone (no invoice drafted)', async () => {
    const queryClient = newQueryClient();
    const dashboard = await mountObserver(queryClient, ['dashboard', '2026-09']);
    const history = await mountObserver(queryClient, ['facture-historique']);

    await invalidateAfterRefuseCra(queryClient, '2026-09');

    await vi.waitFor(() => {
      expect(dashboard.queryFn).toHaveBeenCalledTimes(2);
    });
    // No `vi.waitFor` to hang on for the negative half — wait a real tick and check it never moved.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(history.queryFn).toHaveBeenCalledTimes(1);

    dashboard.unsubscribe();
    history.unsubscribe();
  });
});
