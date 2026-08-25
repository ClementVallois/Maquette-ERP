import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/**
 * `/cra` — the list of months (consultant) or the office's Cra (manager). The real screen is
 * Phase 6 (task 6.1, `GET /api/v1/cras`); this phase gives it a placeholder for both roles that
 * reach it (`config/navigation.ts`'s `cra-mine`/`cra-office` entries).
 */
export const Route = createFileRoute('/_shell/cra/')({
  component: CraListPlaceholder,
});

function CraListPlaceholder(): ReactElement {
  return <ComingSoon />;
}
