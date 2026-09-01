import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { CraListScreen } from '@/features/cra/components/cra-list-screen';
import { LABELS } from '@/lib/labels';

/**
 * Item 7 (QA round 1): the manager/billing-only consultant and status filters, in the URL —
 * "the router already validates search with Zod", so a filtered view is linkable and survives a
 * reload. `CraStatus`'s own four literals (`features/cra/types.ts`), not `@erp/timesheet`'s
 * `CRA_STATUSES`: this SPA keeps its own copy of that enum rather than importing across the
 * apps/packages boundary, the same reason `features/session/types.ts`'s `Role` gives for its own
 * copy of `@erp/platform`'s `ROLES`.
 *
 * `.optional()`, not `.default([])`: with `default([])`, an unrelated pre-existing test —
 * `journeys.spec.ts`'s `page.waitForURL('/cra')` — started timing out (the screen itself rendered
 * correctly; only that specific `waitForURL` assertion failed), consistent with TanStack Router
 * writing the defaulted value back into the URL and the sidebar's plain "CRA" link no longer
 * resolving to bare `/cra`. `.optional()` with `?? []` at the one call site below removed the
 * failure; the URL itself was not inspected to confirm the exact query string this produced.
 */
const CraListSearch = z.object({
  consultantIds: z.array(z.string()).catch([]).optional(),
  statuses: z
    .array(z.enum(['draft', 'submitted', 'refused', 'validated']))
    .catch([])
    .optional(),
  // Item 4 (QA round 2): independent of each other and of the two filters above. `.catch(undefined)`
  // rather than `.catch([])` — these are single values, not lists — so a hand-typed `?year=bogus`
  // degrades to "no filter" the same way an unrecognised status already does, instead of a 400 the
  // visitor cannot self-correct from a URL bar.
  year: z.coerce.number().int().optional().catch(undefined),
  month: z.coerce.number().int().min(1).max(12).optional().catch(undefined),
});

/**
 * `/cra` — the list of months (task 6.1, `GET /api/v1/cras`). `_shell`'s `beforeLoad` already
 * guarantees a persona exists by the time this component renders (`routes/_shell.tsx`), so
 * `Route.useRouteContext()` here reads the same `persona` the shell put there — no second fetch.
 */
export const Route = createFileRoute('/_shell/cra/')({
  validateSearch: CraListSearch,
  component: CraListRoute,
});

function CraListRoute(): ReactElement {
  const { persona } = Route.useRouteContext();
  const { consultantIds, statuses, year, month } = Route.useSearch();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="sr-only">{LABELS.cra.listHeading}</h2>
      <CraListScreen
        role={persona.role}
        consultantIds={consultantIds ?? []}
        statuses={statuses ?? []}
        year={year}
        month={month}
      />
    </div>
  );
}
