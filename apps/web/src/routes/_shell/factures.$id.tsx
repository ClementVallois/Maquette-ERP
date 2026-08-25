import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/** `/factures/$id` — Phase 8 (task 8.2, `GET /api/v1/invoices/:id`). */
export const Route = createFileRoute('/_shell/factures/$id')({
  component: InvoiceDetailPlaceholder,
});

function InvoiceDetailPlaceholder(): ReactElement {
  return <ComingSoon />;
}
