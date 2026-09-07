import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { AssignmentScreen } from '@/features/affectations/components/assignment-screen';

/**
 * `/affectations` — the view filter (item 2, QA round 6: four mutually-exclusive statuses) and
 * the staffing deep link (item 3: the manager dashboard's "Répartition d'équipe" chart), both in
 * the URL — same reasoning as `factures.index.tsx`'s own `FacturesSearch`, a filtered view is
 * linkable and survives a reload.
 */
const AffectationsSearch = z.object({
  view: z.enum(['current', 'upcoming', 'ended', 'all']).default('current').catch('current'),
  staffing: z.enum(['on-mission', 'intercontrat']).optional().catch(undefined),
});

export const Route = createFileRoute('/_shell/affectations')({
  validateSearch: AffectationsSearch,
  component: AffectationsRoute,
});

function AffectationsRoute(): ReactElement {
  const { view, staffing } = Route.useSearch();

  return <AssignmentScreen view={view} {...(staffing === undefined ? {} : { staffing })} />;
}
