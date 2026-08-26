import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { ReactElement } from 'react';

/**
 * The pathless layout `/cra/$period` and `/cra/$period/$consultantId` (ADR-0071) both sit under —
 * `cra.$period.index.tsx`'s own header explains why the split exists. This file renders nothing
 * of its own; it only hands the URL off to whichever of the two actually matched.
 */
export const Route = createFileRoute('/_shell/cra/$period')({
  component: CraPeriodLayout,
});

function CraPeriodLayout(): ReactElement {
  return <Outlet />;
}
