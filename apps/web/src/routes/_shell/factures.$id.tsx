import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { InvoiceDetailScreen } from '@/features/factures/components/invoice-detail-screen';

const InvoiceDetailSearch = z.object({
  client: z.string().trim().max(160).optional().catch(undefined),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional()
    .catch(undefined),
  from: z
    .string()
    .regex(/^\/(?:factures|pre-facturier)(?:\?|$)/u)
    .max(500)
    .optional()
    .catch(undefined),
});

/** `/factures/$id` — task 8.2, `GET /api/v1/invoices/:id`. */
export const Route = createFileRoute('/_shell/factures/$id')({
  validateSearch: InvoiceDetailSearch,
  component: InvoiceDetailRoute,
});

function InvoiceDetailRoute(): ReactElement {
  const { id } = Route.useParams();
  const { from } = Route.useSearch();
  const { persona } = Route.useRouteContext();

  return <InvoiceDetailScreen id={id} role={persona.role} returnTo={from ?? '/factures'} />;
}
