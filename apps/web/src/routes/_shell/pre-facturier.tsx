import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/** `/pre-facturier` — Phase 7 (task 7.1, `GET /api/v1/pre-facturier`, Phase 5.1). */
export const Route = createFileRoute('/_shell/pre-facturier')({
  component: PreFacturierPlaceholder,
});

function PreFacturierPlaceholder(): ReactElement {
  return <ComingSoon />;
}
