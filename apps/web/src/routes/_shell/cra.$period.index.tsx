import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { CraGridScreen } from '@/features/cra/components/cra-grid-screen';

/**
 * `/cra/$period` — the grid, Phase 6's flagship screen (tasks 6.2-6.5, `GET
 * /api/v1/cras/:period/grid`). `$period` is read straight off the URL and handed to the API
 * unvalidated at this layer: a malformed value (`PeriodParam`'s regex on the API side) answers a
 * typed 400, rendered the same way any other refusal is (`CraGridScreen`'s own error branch) — no
 * second copy of the period-shape check belongs here.
 *
 * `.index` (not plain `cra.$period.tsx`) because ADR-0071 gives `/cra/$period` a sibling,
 * `/cra/$period/$consultantId` — TanStack Router's file-based routing nests a second dynamic
 * segment under the first one structurally, so `cra.$period.tsx` had to become the pathless
 * layout (`_shell/cra.$period.tsx`, rendering only `<Outlet />`) both this file and the
 * consultant-id one sit under. Discovered live: without this split, this screen's own component
 * kept rendering under the manager's URL too (there was no `<Outlet />` to hand it off to), which
 * is why a manager reaching `/cra/$period/$consultantId` saw `insufficient-role` — this route's
 * own `forRoles('consultant')` — instead of ADR-0071's screen.
 */
export const Route = createFileRoute('/_shell/cra/$period/')({
  component: CraGridRoute,
});

function CraGridRoute(): ReactElement {
  const { period } = Route.useParams();
  const { persona } = Route.useRouteContext();

  return <CraGridScreen period={period} role={persona.role} />;
}
