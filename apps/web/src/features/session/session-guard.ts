import type { QueryClient } from '@tanstack/react-query';

import { ApiProblemError } from '@/lib/api-client';
import { classifyProblem } from '@/lib/problems';

import { clearPersona } from './api';

/** Shared with the selector's search schema; see ADR-0074. */
export const SESSION_INVALIDATED_SEARCH = '?session=invalidated';

/**
 * Subscribes once to both TanStack caches because query-level `onError` was removed in v5.
 * Session invalidation behavior is defined by ADR-0074.
 */
let handled = false;

/** Exported for the test only: a fresh module instance isn't available per-test in Vitest's ESM runner. */
export function resetSessionGuardForTest(): void {
  handled = false;
}

function handleSessionError(error: unknown, redirectToSelector: (search?: string) => void): void {
  if (handled || !(error instanceof ApiProblemError)) return;

  const action = classifyProblem(error.problem);

  if (action.kind === 'unknown-persona') {
    handled = true;
    // Best-effort: the cookie may already be gone server-side (that is exactly why this fired).
    // The redirect happens regardless, `.catch` only stops an unhandled rejection from surfacing.
    clearPersona()
      .catch(() => undefined)
      .finally(() => {
        redirectToSelector(SESSION_INVALIDATED_SEARCH);
      });
    return;
  }

  if (action.kind === 'redirect-to-selector') {
    handled = true;
    redirectToSelector();
  }
}

export function installSessionGuard(
  queryClient: QueryClient,
  redirectToSelector: (search?: string) => void = (search) => {
    window.location.assign(search === undefined ? '/' : `/${search}`);
  },
): void {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.query.state.status === 'error') {
      handleSessionError(event.query.state.error, redirectToSelector);
    }
  });
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated' && event.mutation.state.status === 'error') {
      handleSessionError(event.mutation.state.error, redirectToSelector);
    }
  });
}
