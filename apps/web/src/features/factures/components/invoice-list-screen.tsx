import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ReceiptTextIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { StatusBadge, type StatusBadgeVariant } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useInvoiceList } from '../hooks';
import type { InvoiceListItem, InvoiceStatus } from '../types';

const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, StatusBadgeVariant> = {
  draft: 'invoice-draft',
  issued: 'invoice-issued',
  cancelledByCreditNote: 'invoice-cancelled',
};

/** The route's own search param (`routes/_shell/factures.index.tsx`) — a client-side **view**
 * over one fetched page (`GET /api/v1/invoices` has no status filter, task 8.1's own comment in
 * `features/factures/api.ts`), never a second request. */
export type InvoiceStatusFilter = 'all' | InvoiceStatus;

const TAB_ORDER: readonly InvoiceStatusFilter[] = [
  'all',
  'draft',
  'issued',
  'cancelledByCreditNote',
];

function TableSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

function columns(): ColumnDef<InvoiceListItem>[] {
  return [
    {
      id: 'client',
      header: LABELS.invoice.client,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.billedToName}</span>
      ),
    },
    {
      id: 'status',
      header: LABELS.preFacturier.invoiceStatus,
      cell: ({ row }) => <StatusBadge variant={INVOICE_STATUS_VARIANT[row.original.status]} />,
    },
    {
      id: 'period',
      header: LABELS.invoice.supplyPeriod,
      cell: ({ row }) => frenchMonth(row.original.supplyPeriod),
    },
    {
      id: 'number',
      header: LABELS.invoice.number,
      cell: ({ row }) => (
        <span className="font-mono text-[0.8125rem] tabular-nums">
          {row.original.invoiceNumber ?? LABELS.preFacturier.notNumberedYet}
        </span>
      ),
    },
    {
      id: 'ttc',
      header: LABELS.invoice.ttc,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.totalTtcCents === null
            ? LABELS.preFacturier.notNumberedYet
            : frenchEuros(row.original.totalTtcCents)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">{LABELS.action.tableActions}</span>,
      cell: ({ row }) => (
        <Link
          to="/factures/$id"
          params={{ id: row.original.id }}
          className="ml-auto block w-fit text-sm text-primary hover:underline"
        >
          {LABELS.invoice.open}
          <span className="sr-only">
            {' '}
            {LABELS.invoice.openFor.replace('{name}', row.original.billedToName)}
          </span>
        </Link>
      ),
    },
  ];
}

interface InvoiceListScreenProps {
  readonly status: InvoiceStatusFilter;
  readonly role: Role;
}

/**
 * `/factures` (task 8.1). `GET /api/v1/invoices` answers one page of up to 50, unfiltered — the
 * status tabs are a client-side view (`docs/frontend-plan.md` §8.1's "onglets de vue comme sur les
 * maquettes"), never a second request per tab.
 */
export function InvoiceListScreen({ status, role }: InvoiceListScreenProps): ReactElement {
  const query = useInvoiceList();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const invoices = query.data?.invoices ?? [];

    return status === 'all' ? invoices : invoices.filter((invoice) => invoice.status === status);
  }, [query.data, status]);

  if (query.isPending) return <TableSkeleton />;

  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiProblemError) {
      const action = classifyProblem(error.problem);
      if (action.kind === 'denied') {
        return <DeniedState deniedBy={action.deniedBy} role={role} />;
      }

      return (
        <ErrorState
          title={headingFor(error.problem)}
          body={sentenceFor(error.problem)}
          {...(error.problem.correlationId === undefined
            ? {}
            : { correlationId: error.problem.correlationId })}
        />
      );
    }

    return (
      <ErrorState title={LABELS.problem.heading.internal} body={LABELS.shell.unexpectedErrorBody} />
    );
  }

  // Task 8.5's own designed empty state — this implantation has never issued a single document,
  // distinct from "invoices exist, none match this tab" below (`DataTable`'s own `emptyState`).
  if (query.data.invoices.length === 0) {
    return (
      <EmptyState
        icon={ReceiptTextIcon}
        title={LABELS.invoice.emptyTitle}
        body={LABELS.invoice.emptyBody}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={status}
        onValueChange={(next) => {
          void navigate({
            to: '/factures',
            search: next === 'all' ? {} : { status: next as InvoiceStatus },
          });
        }}
      >
        <TabsList>
          {TAB_ORDER.map((candidate) => (
            <TabsTrigger key={candidate} value={candidate}>
              {LABELS.invoice.filters[candidate]}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* One `TabsContent`, matching whichever tab is active: this screen uses `Tabs` as a view
         * filter over one table, not as separate per-tab panels, so there is exactly one panel to
         * give Radix's own `aria-controls` (set on every trigger, active or not) something real to
         * point at — found live by axe (task 8.1): with none rendered at all, the active trigger's
         * own `aria-controls` referenced an id nothing in the DOM carried. */}
        <TabsContent value={status}>
          <DataTable
            columns={columns()}
            data={filtered}
            getRowId={(row) => row.id}
            emptyState={
              <EmptyState
                icon={ReceiptTextIcon}
                title={LABELS.invoice.filters[status]}
                body={LABELS.invoice.filterEmptyBody}
              />
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
