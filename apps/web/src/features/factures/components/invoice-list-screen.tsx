import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ReceiptTextIcon } from 'lucide-react';
import type { ReactElement, SyntheticEvent } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { PaginationControls } from '@/components/data-table/pagination-controls';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { StatusBadge, type StatusBadgeVariant } from '@/components/status-badge';
import { TogglePillGroup } from '@/components/toggle-pill-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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

function columns(returnTo: string): ColumnDef<InvoiceListItem>[] {
  return [
    {
      id: 'client',
      accessorFn: (row) => row.billedToName,
      header: LABELS.invoice.client,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.billedToName}</span>
      ),
    },
    {
      id: 'status',
      accessorFn: (row) => row.status,
      header: LABELS.preFacturier.invoiceStatus,
      cell: ({ row }) => <StatusBadge variant={INVOICE_STATUS_VARIANT[row.original.status]} />,
    },
    {
      // Rank A7: the same discriminant the pré-facturier carries — without it, several rows here
      // are the same client and nothing else.
      id: 'consultant',
      accessorFn: (row) => row.consultantName,
      header: LABELS.preFacturier.invoiceConsultant,
      cell: ({ row }) => row.original.consultantName,
    },
    {
      id: 'period',
      accessorFn: (row) => row.supplyPeriod,
      header: LABELS.invoice.supplyPeriod,
      cell: ({ row }) => frenchMonth(row.original.supplyPeriod),
    },
    {
      id: 'number',
      accessorFn: (row) => row.invoiceNumber ?? '',
      header: LABELS.invoice.number,
      cell: ({ row }) => (
        <span className="font-mono text-[0.8125rem] tabular-nums">
          {row.original.invoiceNumber ?? LABELS.preFacturier.notNumberedYet}
        </span>
      ),
    },
    {
      id: 'ttc',
      accessorFn: (row) => row.totalTtcCents ?? -1,
      header: LABELS.invoice.ttc,
      cell: ({ row }) => (
        <span
          className="tabular-nums"
          title={row.original.totalsAreProvisional ? LABELS.invoice.provisionalTotals : undefined}
        >
          {row.original.totalTtcCents === null
            ? LABELS.preFacturier.notNumberedYet
            : frenchEuros(row.original.totalTtcCents)}
          {row.original.totalsAreProvisional && (
            <span aria-hidden="true" className="text-muted-foreground">
              {' '}
              *
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span className="sr-only">{LABELS.action.tableActions}</span>,
      cell: ({ row }) => (
        <Link
          to="/factures/$id"
          params={{ id: row.original.id }}
          search={{
            client: row.original.billedToName,
            period: row.original.supplyPeriod,
            from: returnTo,
          }}
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
  readonly year: number | undefined;
  readonly search: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * `/factures` (task 8.1). `GET /api/v1/invoices` answers one page of up to 50, unfiltered — the
 * status filter is a client-side view (`docs/frontend-plan.md` §8.1's "onglets de vue comme sur
 * les maquettes"), never a second request per pill.
 */
export function InvoiceListScreen({
  status,
  role,
  year,
  search,
  page,
  pageSize,
}: InvoiceListScreenProps): ReactElement {
  const query = useInvoiceList({
    ...(status === 'all' ? {} : { status }),
    ...(year === undefined ? {} : { year }),
    ...(search === '' ? {} : { search }),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const navigate = useNavigate();
  const returnParams = new URLSearchParams();
  if (status !== 'all') returnParams.set('status', status);
  if (year !== undefined) returnParams.set('year', String(year));
  if (search !== '') returnParams.set('search', search);
  returnParams.set('page', String(page));
  returnParams.set('pageSize', String(pageSize));
  const returnTo = `/factures?${returnParams.toString()}`;

  function searchState(overrides: {
    readonly status?: InvoiceStatusFilter;
    readonly year?: number | undefined;
    readonly search?: string;
    readonly page?: number;
    readonly pageSize?: number;
  }) {
    const nextStatus = overrides.status ?? status;
    const nextYear = 'year' in overrides ? overrides.year : year;
    const nextSearch = overrides.search ?? search;
    const nextPage = overrides.page ?? page;
    const nextPageSize = overrides.pageSize ?? pageSize;

    return {
      ...(nextStatus === 'all' ? {} : { status: nextStatus }),
      ...(nextYear === undefined ? {} : { year: nextYear }),
      ...(nextSearch === '' ? {} : { search: nextSearch }),
      page: nextPage,
      pageSize: nextPageSize,
    };
  }

  function submitSearch(event: SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    const entry = new FormData(event.currentTarget).get('invoice-search');
    const value = typeof entry === 'string' ? entry.trim() : '';
    void navigate({ to: '/factures', search: searchState({ search: value, page: 1 }) });
  }

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
  const filtersActive = status !== 'all' || year !== undefined || search !== '';
  if (query.data.total === 0 && !filtersActive) {
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
      <form className="flex flex-wrap items-end gap-3" onSubmit={submitSearch}>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium">
          {LABELS.invoice.search}
          <Input
            key={search}
            name="invoice-search"
            type="search"
            defaultValue={search}
            placeholder={LABELS.invoice.searchPlaceholder}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {LABELS.invoice.year}
          <Input
            className="w-32"
            type="number"
            min={2000}
            max={2100}
            value={year ?? ''}
            placeholder={LABELS.invoice.allYears}
            onChange={(event) => {
              const value = event.currentTarget.value;
              void navigate({
                to: '/factures',
                search: searchState({
                  year: value === '' ? undefined : Number.parseInt(value, 10),
                  page: 1,
                }),
              });
            }}
          />
        </label>
        <Button type="submit" variant="outline">
          {LABELS.invoice.searchAction}
        </Button>
        {filtersActive && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: '/factures', search: { page: 1, pageSize } })}
          >
            {LABELS.invoice.clearFilters}
          </Button>
        )}
      </form>
      {/* Item 8 (QA round 1): a segmented pill per status, `exclusive` (item 7's own multi-select
       * CRA-status filter is the non-exclusive sibling) — obviously individually clickable rather
       * than one wide bar, the brief's own complaint about the previous `Tabs` rendering. */}
      <TogglePillGroup
        label={LABELS.preFacturier.invoiceStatus}
        exclusive
        options={TAB_ORDER.map((candidate) => ({
          value: candidate,
          label: LABELS.invoice.filters[candidate],
          count: query.data.statusCounts[candidate],
        }))}
        selected={[status]}
        onChange={([next]) => {
          void navigate({
            to: '/factures',
            search: searchState({
              status: next === undefined ? 'all' : (next as InvoiceStatusFilter),
              page: 1,
            }),
          });
        }}
      />
      <DataTable
        columns={columns(returnTo)}
        data={query.data.invoices}
        getRowId={(row) => row.id}
        numericColumns={['ttc']}
        emptyState={
          <EmptyState
            icon={ReceiptTextIcon}
            title={LABELS.invoice.filters[status]}
            body={LABELS.invoice.filterEmptyBody}
          />
        }
      />
      <PaginationControls
        total={query.data.total}
        limit={query.data.limit}
        offset={query.data.offset}
        onPageChange={(offset) =>
          void navigate({
            to: '/factures',
            search: searchState({ page: Math.floor(offset / pageSize) + 1 }),
          })
        }
        onPageSizeChange={(limit) =>
          void navigate({
            to: '/factures',
            search: searchState({ page: 1, pageSize: limit }),
          })
        }
      />
    </div>
  );
}
