import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/**
 * `/tableau-de-bord` — reachable by every role (frontend-plan.md task 4.3), and the redirect
 * target after choosing a persona (task 4.1). The real screen is Phase 8 (task 8.4,
 * `GET /api/v1/dashboard`); this phase gives it a considered placeholder rather than build ahead
 * of an endpoint that does not exist yet (rule 0bis.8).
 */
export const Route = createFileRoute('/_shell/tableau-de-bord')({
  component: DashboardPlaceholder,
});

function DashboardPlaceholder(): ReactElement {
  return <ComingSoon />;
}
