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
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
  search: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce
    .number()
    .pipe(z.union([z.literal(10), z.literal(20), z.literal(50)]))
    .default(20)
    .catch(20),
});

export const Route = createFileRoute('/_shell/factures/')({
  validateSearch: FacturesSearch,
  component: FacturesRoute,
});

function FacturesRoute(): ReactElement {
  const { status, year, search, page, pageSize } = Route.useSearch();
  const { persona } = Route.useRouteContext();

  return (
    <InvoiceListScreen
      status={status ?? 'all'}
      role={persona.role}
      year={year}
      search={search ?? ''}
      page={page}
      pageSize={pageSize}
    />
  );
}
