import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { installSessionGuard } from '@/features/session/session-guard';
import { queryClient } from '@/lib/query-client';

import { router } from './router';

// Wired once, at module load, alongside the `QueryClient` it subscribes to — not inside the
// component body, where React's StrictMode double-invoke (`main.tsx`) would register the
// subscription twice. `session-guard.ts`'s own `handled` guard would still stop it firing twice,
// but subscribing once is the more honest fix.
installSessionGuard(queryClient);

/**
 * The app's composition root (frontend-plan.md Phase 4 replaces this file's previous content —
 * `PersonasGateEvidence`, Phase 3's Gate evidence — with the real router; `docs/open-questions.md`,
 * Phase 3 checkpoint point 5, names this as the fix and it is deleted, not moved). `TooltipProvider`
 * is mounted once here so `components/shell/sidebar.tsx`'s collapsed-mode tooltips (and any later
 * screen's) do not each need their own.
 */
export function App(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
