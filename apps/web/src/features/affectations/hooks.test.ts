import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateAfterSaveAssignment } from './hooks';

/**
 * Package 11's dependency table (`docs/adr/0113-mutations-invalidate-every-projection-they-
 * actually-change.md`): a saved assignment changes `public.assignments`, which is exactly what
 * `apps/api/src/staffing/staffing-snapshot.ts`'s `managerStaffingSnapshot` reads for the
 * manager dashboard's `staffing` panel — not invalidated before this package. Same
 * `QueryObserver` technique as `cra/hooks.test.ts`, `factures/hooks.test.ts` and
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

describe('invalidateAfterSaveAssignment', () => {
  it('refetches the assignments catalogue it already invalidated, plus the dashboard', async () => {
    const queryClient = newQueryClient();
    const assignments = await mountObserver(queryClient, ['affectations']);
    const dashboard = await mountObserver(queryClient, ['dashboard', '2026-09']);

    await invalidateAfterSaveAssignment(queryClient);

    await vi.waitFor(() => {
      expect(assignments.queryFn).toHaveBeenCalledTimes(2);
      expect(dashboard.queryFn).toHaveBeenCalledTimes(2);
    });

    assignments.unsubscribe();
    dashboard.unsubscribe();
  });
});
