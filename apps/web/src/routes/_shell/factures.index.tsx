import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { InvoiceListScreen } from '@/features/factures/components/invoice-list-screen';

/**
 * `/factures` (plural — Annexe C.9: never `/facture/:id`, the SSR singular). Task 8.1,
 * `GET /api/v1/invoices`. `status` is optional and defaults to `'all'` in the component: the
 * dashboard's own billing action link (task 8.4) deep-links `?status=draft`, and a bare
 * `/factures` (the sidebar's own link) shows every invoice.
 */
const FacturesSearch = z.object({
  status: z.enum(['draft', 'issued', 'cancelledByCreditNote']).optional(),
});

export const Route = createFileRoute('/_shell/factures/')({
  validateSearch: FacturesSearch,
  component: FacturesRoute,
});

function FacturesRoute(): ReactElement {
  const { status } = Route.useSearch();
  const { persona } = Route.useRouteContext();

  return <InvoiceListScreen status={status ?? 'all'} role={persona.role} />;
}
