import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { DashboardScreen } from '@/features/dashboard/components/dashboard-screen';
import { currentPeriod } from '@/lib/period';

/**
 * `/tableau-de-bord` — reachable by every role (frontend-plan.md task 4.3), and the redirect
 * target after choosing a persona (task 4.1). Task 8.4, `GET /api/v1/dashboard?period=`. The
 * period is always the wall-clock "now" (`lib/period.ts`) — there is no picker on this screen, and
 * none of Annexe A's other periods (the seed's June, J1's August) is what "the dashboard, right
 * now" means for a first-time visitor.
 */
export const Route = createFileRoute('/_shell/tableau-de-bord')({
  component: DashboardRoute,
});

function DashboardRoute(): ReactElement {
  const { persona } = Route.useRouteContext();

  return <DashboardScreen role={persona.role} period={currentPeriod()} />;
}
