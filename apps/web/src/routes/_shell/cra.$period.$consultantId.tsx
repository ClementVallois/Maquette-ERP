import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ManagerCraGridScreen } from '@/features/cra/components/manager-cra-grid-screen';

/**
 * `/cra/$period/$consultantId` — ADR-0071's manager-only, read-only view of a named consultant's
 * month (`GET /api/v1/consultants/:consultantId/cras/:period/grid`). Both params are read straight
 * off the URL and handed to the API unvalidated at this layer, same reasoning as `/cra/$period`:
 * a malformed value answers a typed refusal the screen's own error branch renders.
 */
export const Route = createFileRoute('/_shell/cra/$period/$consultantId')({
  component: ManagerCraGridRoute,
});

function ManagerCraGridRoute(): ReactElement {
  const { period, consultantId } = Route.useParams();
  const { persona } = Route.useRouteContext();

  return <ManagerCraGridScreen period={period} consultantId={consultantId} role={persona.role} />;
}
