import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/**
 * `/cra/$period` — the grid, Phase 6's flagship screen (task 6.2, `GET /api/v1/cras/:period/grid`,
 * Phase 5.2). Placeholder only: `$period` is not read here, since there is nothing yet to fetch
 * with it.
 */
export const Route = createFileRoute('/_shell/cra/$period')({
  component: CraGridPlaceholder,
});

function CraGridPlaceholder(): ReactElement {
  return <ComingSoon />;
}
