import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { CraListScreen } from '@/features/cra/components/cra-list-screen';
import { LABELS } from '@/lib/labels';

/**
 * `/cra` — the list of months (task 6.1, `GET /api/v1/cras`). `_shell`'s `beforeLoad` already
 * guarantees a persona exists by the time this component renders (`routes/_shell.tsx`), so
 * `Route.useRouteContext()` here reads the same `persona` the shell put there — no second fetch.
 */
export const Route = createFileRoute('/_shell/cra/')({
  component: CraListRoute,
});

function CraListRoute(): ReactElement {
  const { persona } = Route.useRouteContext();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="sr-only">{LABELS.cra.listHeading}</h2>
      <CraListScreen role={persona.role} />
    </div>
  );
}
