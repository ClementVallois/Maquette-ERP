import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { CraGridScreen } from '@/features/cra/components/cra-grid-screen';

/**
 * `/cra/$period` — the grid, Phase 6's flagship screen (tasks 6.2-6.5, `GET
 * /api/v1/cras/:period/grid`). `$period` is read straight off the URL and handed to the API
 * unvalidated at this layer: a malformed value (`PeriodParam`'s regex on the API side) answers a
 * typed 400, rendered the same way any other refusal is (`CraGridScreen`'s own error branch) — no
 * second copy of the period-shape check belongs here.
 */
export const Route = createFileRoute('/_shell/cra/$period')({
  component: CraGridRoute,
});

function CraGridRoute(): ReactElement {
  const { period } = Route.useParams();
  const { persona } = Route.useRouteContext();

  return <CraGridScreen period={period} role={persona.role} />;
}
