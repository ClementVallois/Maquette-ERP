import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { MargeScreen } from '@/features/marge/components/marge-screen';

const MargeSearch = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
});

/**
 * `/marge/$consultantId?period=` — the pinned route (`docs/frontend-plan.md` §3). Task 7.5,
 * `GET /api/v1/consultants/:id/economics?period=`, manager-only. Reached only by an explicit click
 * from a pré-facturier row (`LABELS.preFacturier.reveal`, `pre-facturier-screen.tsx`) — there is no
 * sidebar entry pointing here (`docs/open-questions.md`, row dated 24/08/2026, resolved this phase:
 * see `config/navigation.ts`'s own comment for the reasoning), so `period` has no sensible default
 * the way `/pre-facturier`'s does: a visitor who lands here always came from a specific row on a
 * specific period, and a missing/malformed `period` is exactly what `validateSearch` throwing
 * answers — TanStack Router's own designed-error path, the same one a malformed path param takes.
 */
export const Route = createFileRoute('/_shell/marge/$consultantId')({
  validateSearch: MargeSearch,
  component: MargeRoute,
});

function MargeRoute(): ReactElement {
  const { consultantId } = Route.useParams();
  const { period } = Route.useSearch();
  const { persona } = Route.useRouteContext();

  return <MargeScreen consultantId={consultantId} period={period} role={persona.role} />;
}
