import { createRouter } from '@tanstack/react-router';

import { queryClient } from '@/lib/query-client';

import { routeTree } from './routeTree.gen';

/**
 * One router instance, one `QueryClient` instance, wired together via `context` (`__root.tsx`'s
 * `RouterContext`) — this is what lets `routes/_shell.tsx`'s `beforeLoad` call
 * `context.queryClient.ensureQueryData` instead of importing the singleton a second way.
 */
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
