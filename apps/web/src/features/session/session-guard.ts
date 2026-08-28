import type { QueryClient } from '@tanstack/react-query';

import { ApiProblemError } from '@/lib/api-client';
import { classifyProblem } from '@/lib/problems';

import { clearPersona } from './api';

/**
 * The query string this guard appends when it sends an invalidated session back to the selector,
 * and which `routes/index.tsx` reads to render the notice explaining why. **Not a toast**, and
 * ADR-0074 is why: the redirect below is `window.location.assign`, a hard navigation that destroys
 * the document — and a toast with it. A message that explains a redirect cannot live on the page
 * the redirect is discarding; it has to be handed to the destination.
 */
export const SESSION_INVALIDATED_SEARCH = '?session=expired';

/**
 * frontend-plan.md task 4.4's two session-cookie global states, wired once for the whole app
 * rather than per-hook: `/problems/unknown-persona` (a stale or forged cookie) purges the cookie
 * and sends the visitor back to the selector **carrying the reason in the URL** (ADR-0074);
 * `/problems/no-persona` does the same minus the purge and the notice, since there was never a
 * cookie to clear and nothing happened that needs explaining.
 *
 * Subscribed on the `QueryCache`/`MutationCache` rather than a per-query `onError` (TanStack Query
 * v5 removed that option for queries) or repeated in every feature's `hooks.ts` — this is the one
 * place in the app where "the session stopped resolving" is handled, which is what "global state"
 * means in task 4.4's own heading. `lib/query-client.ts` stays the generic factory its own header
 * describes; this lives in `features/session` because purging a persona is a session concern, not
 * a query-client one.
 *
 * **Not exercised end-to-end in Phase 4.** Every route `_shell` guards calls only
 * `GET /api/v1/session`, which is `PUBLIC` (`apps/api/src/routes/session.ts`) and therefore never
 * answers with either problem type — confirmed by reading the route, not assumed. No screen built
 * in this phase calls a `forRoles`-guarded endpoint, which is the only kind of request that can
 * produce `unknown-persona` (verified in `apps/api/src/personas/access.ts`: the check only runs
 * when `access.kind !== 'public'`). This module is therefore proven only at the unit level
 * (`session-guard.test.ts`, against a manufactured `ApiProblemError`) until the phase that first
 * calls a guarded route from the SPA (Phase 5/6) can trigger it live. Recorded in the Phase 4
 * checkpoint (`docs/open-questions.md`) rather than left to be rediscovered as a gap in coverage.
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

  // `no-persona`: there was never a cookie, so there is nothing to explain and nothing to purge.
  // The selector is simply where this visitor belongs — no query string, no notice.
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
