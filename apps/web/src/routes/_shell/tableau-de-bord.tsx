import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { DashboardScreen } from '@/features/dashboard/components/dashboard-screen';
import { currentPeriod } from '@/lib/period';

const DashboardSearch = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional(),
});

/**
 * `/tableau-de-bord` — reachable by every role (frontend-plan.md task 4.3), and the redirect
 * target after choosing a persona (task 4.1). Task 8.4, `GET /api/v1/dashboard?period=`.
 *
 * A bare visit still reads the wall-clock "now" (`lib/period.ts`): that is what "the dashboard,
 * right now" means for a first-time visitor, and this route still carries **no picker** — nothing
 * in the rendered page lets a visitor change `period`. The `?period=` override exists for the
 * reason and with the rejected alternatives **ADR-0073** records; read it before touching this
 * line rather than re-arguing the case here.
 */
export const Route = createFileRoute('/_shell/tableau-de-bord')({
  validateSearch: DashboardSearch,
  component: DashboardRoute,
});

function DashboardRoute(): ReactElement {
  const { persona } = Route.useRouteContext();
  const { period } = Route.useSearch();

  return <DashboardScreen role={persona.role} period={period ?? currentPeriod()} />;
}
