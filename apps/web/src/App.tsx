import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { usePersonas } from '@/features/session/hooks';
import { queryClient } from '@/lib/query-client';

import { KitchenSink } from './kitchen-sink';

/**
 * Phase 3's Gate evidence (frontend-plan.md task 3.6's Gate: "le kitchen sink (ou une page
 * scratch) affiche les 4 personas **réellement récupérées** via le proxy dev"). `usePersonas`
 * calls the real `GET /api/v1/personas` through `lib/api-client.ts` — no MSW, no fixture, no
 * hard-coded list. `apps/web/e2e/personas-live.spec.ts` is what actually exercises this against a
 * running API and captures the gate's screenshot.
 *
 * Rendered directly here for the same reason `KitchenSink` is (see below): TanStack Router does
 * not exist yet. Phase 4 replaces this block with the real persona-selector screen
 * (`routes/index.tsx`) and this function is deleted, not moved.
 */
function PersonasGateEvidence(): ReactElement {
  const personas = usePersonas();

  if (personas.isPending) {
    return <p className="px-6 py-4 text-sm text-muted-foreground">Chargement des personas…</p>;
  }
  if (personas.isError) {
    return <p className="px-6 py-4 text-sm text-destructive">Erreur : {personas.error.message}</p>;
  }

  return (
    <section className="mx-auto flex max-w-[1360px] flex-col gap-3 px-6 py-8">
      <h2 className="text-card-title">Phase 3 — personas via GET /api/v1/personas</h2>
      <p className="text-help">{personas.data.notice}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {personas.data.personas.map((persona) => (
          <li key={persona.key} data-persona-key={persona.key}>
            {persona.displayName} — {persona.role} — {persona.office}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Phase 2's design-system showcase, rendered directly here because TanStack Router does not
// exist yet (Phase 4, frontend-plan.md §3). Phase 4 moves this render to the `dev.composants`
// route (excluded from the production nav) without changing `KitchenSink` itself.
export function App(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <PersonasGateEvidence />
      <KitchenSink />
    </QueryClientProvider>
  );
}
