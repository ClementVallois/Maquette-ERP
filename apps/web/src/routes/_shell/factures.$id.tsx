import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { InvoiceDetailScreen } from '@/features/factures/components/invoice-detail-screen';

/** `/factures/$id` — task 8.2, `GET /api/v1/invoices/:id`. */
export const Route = createFileRoute('/_shell/factures/$id')({
  component: InvoiceDetailRoute,
});

function InvoiceDetailRoute(): ReactElement {
  const { id } = Route.useParams();
  const { persona } = Route.useRouteContext();

  return <InvoiceDetailScreen id={id} role={persona.role} />;
}
