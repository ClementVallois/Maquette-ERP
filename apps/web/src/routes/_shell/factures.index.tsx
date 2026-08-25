import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

/**
 * `/factures` (plural — Annexe C.9: never `/facture/:id`, the SSR singular). Phase 8 (task 8.1,
 * `GET /api/v1/invoices`).
 */
export const Route = createFileRoute('/_shell/factures/')({
  component: InvoiceListPlaceholder,
});

function InvoiceListPlaceholder(): ReactElement {
  return <ComingSoon />;
}
