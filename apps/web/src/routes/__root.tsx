import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  Outlet,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ErrorState } from '@/components/feedback/error-state';
import { ApiProblemError } from '@/lib/api-client';
import { LABELS } from '@/lib/labels';
import { headingFor, sentenceFor } from '@/lib/problems';

/**
 * The router's context type (`src/router.ts`'s `createRouter({ context: { queryClient } })`):
 * every route's `beforeLoad`/`loader` reads the same `QueryClient` instance
 * `lib/query-client.ts` creates, rather than each route importing the singleton directly — this
 * is what lets `_shell.tsx`'s guard call `queryClient.ensureQueryData` without a second query key
 * for the same session `useSession` already caches.
 */
export interface RouterContext {
  readonly queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundScreen,
  errorComponent: RootErrorBoundary,
});

function RootLayout(): ReactElement {
  return (
    <>
      {/* frontend-plan.md task 4.2 / direction-visuelle.md §6: first in tab order, visible on
          focus — the SSR printables already have one (ADR-0061), the SPA does not get to be
          worse. Each top-level page below owns an element with `id="main-content"`. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        {LABELS.nav.skipToContent}
      </a>
      <Outlet />
    </>
  );
}

function CenteredProblemScreen({ children }: { readonly children: ReactElement }): ReactElement {
  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-background px-6 py-12"
    >
      {children}
    </main>
  );
}

/** Styled 404 (task 4.4): no matching route, at any depth. */
function NotFoundScreen(): ReactElement {
  return (
    <CenteredProblemScreen>
      <ErrorState
        title={LABELS.shell.notFoundTitle}
        body={LABELS.shell.notFoundBody}
        action={{ label: LABELS.shell.notFoundAction, to: '/' }}
      />
    </CenteredProblemScreen>
  );
}

/**
 * The global error boundary (task 4.4): "rendant un `ProblemDetails` en français avec
 * `correlationId`". An `ApiProblemError` reaching here means a `beforeLoad`/`loader` threw one
 * that no route-local handling caught (every route in Phase 4 is a plain component with no
 * `loader`, so this is the backstop for a phase that adds one without its own error UI); anything
 * else is an unrelated JS exception, rendered the same way minus the fields it does not have.
 */
function RootErrorBoundary({ error }: ErrorComponentProps): ReactElement {
  if (error instanceof ApiProblemError) {
    const { problem } = error;

    return (
      <CenteredProblemScreen>
        <ErrorState
          title={headingFor(problem)}
          body={sentenceFor(problem)}
          {...(problem.correlationId === undefined ? {} : { correlationId: problem.correlationId })}
          action={{ label: LABELS.problem.back, to: '/' }}
        />
      </CenteredProblemScreen>
    );
  }

  return (
    <CenteredProblemScreen>
      <ErrorState
        title={LABELS.problem.heading.internal}
        body={LABELS.shell.unexpectedErrorBody}
        action={{ label: LABELS.problem.back, to: '/' }}
      />
    </CenteredProblemScreen>
  );
}
