import { QueryClient } from '@tanstack/react-query';

import { ApiProblemError } from './api-client.ts';

/**
 * frontend-plan.md task 3.5: reasonable `staleTime`, retry at most once, never on a 4xx — "un
 * refus métier ne se rejoue pas". Invalidation is per-feature, in each feature's `hooks.ts`, after
 * its own mutations — not here, which would make this file grow one entry per feature.
 */

// Thirty seconds: this is a demo instance on a seed that changes only when a persona acts on it
// (validate, refuse, issue). Long enough that switching between two screens in the same demo beat
// does not re-fetch, short enough that a second beat later in the same session sees the result of
// the first.
const STALE_TIME_MS = 30_000;

const MAX_RETRIES = 1;
const CLIENT_ERROR_FLOOR = 400;
const CLIENT_ERROR_CEILING = 500;

/**
 * A business refusal (400-499) is a fact about the request, not a transient failure — retrying it
 * unchanged produces the same refusal. Anything else (a 5xx, a thrown bug that is not even an
 * `ApiProblemError`) is worth the one retry TanStack Query's own default posture already assumes.
 */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiProblemError)) return true;

  return !(
    error.problem.status >= CLIENT_ERROR_FLOOR && error.problem.status < CLIENT_ERROR_CEILING
  );
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      retry: (failureCount, error) => failureCount < MAX_RETRIES && isRetryable(error),
    },
    mutations: {
      // A mutation is a write a persona chose to make. Retrying it automatically on a network
      // blip could double-submit; the screen's own retry (the button, pressed again) is the one
      // this repository wants, same as the API's own idempotency-key discipline for issuance.
      retry: false,
    },
  },
});
