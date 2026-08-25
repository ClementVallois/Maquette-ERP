import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/**
 * `/marge/$consultantId` — the pinned route (`docs/frontend-plan.md` §3). Phase 7 (task 7.5,
 * `GET /api/v1/consultants/:id/economics`), manager-only. `Cjm`/`Tjm`/margin never appear here in
 * Phase 4 — there is nothing fetched yet, only the placeholder (Annexe C.12).
 */
export const Route = createFileRoute('/_shell/marge/$consultantId')({
  component: MargeDetailPlaceholder,
});

function MargeDetailPlaceholder(): ReactElement {
  return <ComingSoon />;
}
