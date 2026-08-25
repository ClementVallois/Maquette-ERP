import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/**
 * `/marge` — **not** a route `docs/frontend-plan.md` §3 pins (only `/marge/$consultantId` is
 * pinned there). Added here as the landing target for the "Marge" nav entry task 4.3 asks for and
 * §3's own list does not provide a destination for — a checkpoint point
 * (`docs/open-questions.md`), not a silent extension of the pinned tree. §7.5 reaches the real
 * margin screen only by explicit navigation from a pré-facturier row, never from this index, so
 * whether a standing "Marge" nav item (and this route) survive Phase 7 at all is a second, open
 * question the same checkpoint entry names.
 */
export const Route = createFileRoute('/_shell/marge/')({
  component: MargePlaceholder,
});

function MargePlaceholder(): ReactElement {
  return <ComingSoon />;
}
