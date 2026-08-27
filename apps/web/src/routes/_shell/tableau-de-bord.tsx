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
 * in the rendered page lets a visitor change `period`. `docs/open-questions.md`'s row of
 * 27/08/2026 is what added the `?period=` override: the seed is frozen at `2026-06` (ADR-0022),
 * so a wall-clock-only reading answers empty for every role but the consultant's on any date after
 * June 2026 — which is every date this mockup will ever be opened on — and task 10.4's demo
 * checklist doubles as the final Playwright spec, so it needs a period it can pin rather than one
 * that depends on the day the suite happens to run. Precedent: `routes/_shell/pre-facturier.tsx`'s
 * own optional `?period=`, same regex, same "the URL may say what the UI does not offer a control
 * for."
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
