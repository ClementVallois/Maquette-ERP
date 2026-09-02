import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { FileTextIcon, ReceiptTextIcon } from 'lucide-react';
import type { ReactElement, SyntheticEvent } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { CopyLinkButton } from '@/components/copy-link-button';
import { DataTable } from '@/components/data-table/data-table';
import { PaginationControls } from '@/components/data-table/pagination-controls';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { GlossaryTerm } from '@/components/glossary-term';
import { StatCard } from '@/components/stat-card';
import { StatusBadge, type StatusBadgeVariant } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RefuseDialog } from '@/features/cra/components/refuse-dialog';
import { ValidateResultDialog } from '@/features/cra/components/validate-result-dialog';
import { useValidateCra } from '@/features/cra/hooks';
import type { CraStatus, ValidationResponse } from '@/features/cra/types';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDate, frenchDays, frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { usePreFacturier } from '../hooks';
import type { DeclineReason, PreFacturierCraRow, PreFacturierInvoiceRow } from '../types';

const CRA_STATUS_VARIANT: Record<CraStatus, StatusBadgeVariant> = {
  draft: 'cra-draft',
  submitted: 'cra-submitted',
  validated: 'cra-validated',
  refused: 'cra-refused',
};

const INVOICE_STATUS_VARIANT: Record<PreFacturierInvoiceRow['status'], StatusBadgeVariant> = {
  draft: 'invoice-draft',
  issued: 'invoice-issued',
  cancelledByCreditNote: 'invoice-cancelled',
};

const DECLINE_REASON_VARIANT: Record<DeclineReason, StatusBadgeVariant> = {
  notRegie: 'declined-not-regie',
  unknownMission: 'declined-unknown-mission',
  noAgreedRate: 'declined-no-agreed-rate',
  unknownClient: 'declined-unknown-client',
};

function TableSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

interface PeriodSelectorProps {
  readonly period: string;
  readonly offered: readonly string[];
}

function PeriodSelector({ period, offered }: PeriodSelectorProps): ReactElement {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="pre-facturier-period" className="text-label">
        {LABELS.preFacturier.period}
      </label>
      <Select
        value={period}
        onValueChange={(next) => {
          void navigate({ to: '/pre-facturier', search: { period: next } });
        }}
      >
        <SelectTrigger id="pre-facturier-period" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {offered.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              {frenchMonth(candidate)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function invoiceColumns(returnTo: string): ColumnDef<PreFacturierInvoiceRow>[] {
  return [
    {
      id: 'client',
      accessorFn: (row) => row.billedToName,
      header: LABELS.preFacturier.client,
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
      // Rank A7: what tells two drafts to the same client, same month, apart — without this,
      // several rows above were the client's name and nothing else.
      id: 'consultant',
      accessorFn: (row) => row.consultantName,
      header: LABELS.preFacturier.invoiceConsultant,
      cell: ({ row }) => row.original.consultantName,
    },
    {
      id: 'missions',
      accessorFn: (row) => row.missionNames.join(', '),
      header: LABELS.preFacturier.invoiceMissions,
      cell: ({ row }) => row.original.missionNames.join(', '),
    },
    {
      id: 'lineCount',
      accessorFn: (row) => row.lineCount,
      header: LABELS.preFacturier.invoiceLines,
      cell: ({ row }) => <span className="tabular-nums">{row.original.lineCount}</span>,
    },
    {
      id: 'createdAt',
      accessorFn: (row) => row.createdAt ?? '',
      header: LABELS.preFacturier.invoiceCreatedAt,
      cell: ({ row }) =>
        row.original.createdAt === null ? (
          LABELS.preFacturier.notNumberedYet
        ) : (
          <span className="tabular-nums">{frenchDate(row.original.createdAt.slice(0, 10))}</span>
        ),
    },
    {
      id: 'invoiceNumber',
      accessorFn: (row) => row.invoiceNumber ?? '',
      header: LABELS.preFacturier.invoiceNumber,
      cell: ({ row }) => (
        <span className="font-mono text-[0.8125rem] tabular-nums">
          {row.original.invoiceNumber ?? LABELS.preFacturier.notNumberedYet}
        </span>
      ),
    },
    {
      id: 'totalTtc',
      accessorFn: (row) => row.totalTtcCents ?? -1,
      header: LABELS.preFacturier.totalIncludingVat,
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
      id: 'open',
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
          {LABELS.preFacturier.invoiceOpen}
        </Link>
      ),
    },
  ];
}

function craColumns(
  role: Role,
  period: string,
  onValidate: (row: PreFacturierCraRow) => void,
  onRefuse: (row: PreFacturierCraRow) => void,
): ColumnDef<PreFacturierCraRow>[] {
  // Explicitly typed before the `.filter()` below: TypeScript's contextual typing does not flow
  // an array literal's element type through a chained method call, only through a direct
  // assignment or `return` — the same reason `cra-list-screen.tsx`'s `columnsFor` builds its array
  // with `push` rather than returning a literal straight away.
  const columns: ColumnDef<PreFacturierCraRow>[] = [
    {
      id: 'consultant',
      accessorFn: (row) => row.consultantName,
      header: LABELS.preFacturier.consultant,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.consultantName}</span>
      ),
    },
    {
      id: 'status',
      accessorFn: (row) => row.status,
      header: LABELS.preFacturier.craStatus,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge variant={CRA_STATUS_VARIANT[row.original.status]} />
          {row.original.late && <StatusBadge variant="cra-late" />}
        </div>
      ),
    },
    {
      id: 'recorded',
      accessorFn: (row) => row.recordedQuarterDays,
      header: LABELS.preFacturier.recorded,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchDays(row.original.recordedQuarterDays)}</span>
      ),
    },
    {
      id: 'blocking',
      enableSorting: false,
      header: LABELS.preFacturier.blocking,
      cell: ({ row }) =>
        row.original.blockingReasons.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            {LABELS.preFacturier.nothingBlocking}
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {row.original.blockingReasons.map((reason, index) => (
              // The same reason can legitimately repeat (two declined lines on the same mission),
              // and nothing about a reason string identifies which recorded day it came from — a
              // `${reason}-${index}` key is stable across re-renders of this same row without
              // pretending the index identifies anything.
              <li key={`${reason}-${String(index)}`}>
                <StatusBadge variant={DECLINE_REASON_VARIANT[reason]} />
              </li>
            ))}
          </ul>
        ),
    },
    // Task 7.5's "navigation explicite depuis une ligne du pré-facturier (jamais un survol)" —
    // this is that click, one per row. `GET .../economics` is manager-only (Annexe A), so the
    // column is filtered out below for every other role rather than rendered and left to 403 on
    // click: the offer follows the role (BUILD-RULES § Authorization), the same rule `actions`
    // already applies to `billing`.
    {
      id: 'marge',
      enableSorting: false,
      header: () => <span className="sr-only">{LABELS.margin.heading}</span>,
      cell: ({ row }) => (
        <Link
          to="/marge/$consultantId"
          params={{ consultantId: row.original.consultantId }}
          search={{ period }}
          className="text-sm text-primary hover:underline"
        >
          {LABELS.preFacturier.reveal}
          <span className="sr-only">
            {' '}
            {LABELS.preFacturier.revealFor.replace('{name}', row.original.consultantName)}
          </span>
        </Link>
      ),
    },
    // `role` decides nothing here: `decidable` is already the server's own combination of role and
    // status (`mayDecide && status === 'submitted'`, `composition/pre-facturier.ts`) — repeating a
    // role check client-side would be a second copy of the same rule, not a second control.
    {
      id: 'actions',
      enableSorting: false,
      header: () => <span className="sr-only">{LABELS.action.tableActions}</span>,
      // Item 3 (QA round 1): a manager used to have to leave the pré-facturier through the CRA
      // menu (`cra-list-screen.tsx`'s own `Link` to this same route) to look at a row before
      // deciding on it. "Ouvrir" is offered on every manager row, decidable or not — a validated
      // or refused Cra is still worth opening to read — while validate/refuse stay gated on
      // `decidable`, exactly as before.
      cell: ({ row }) => (
        <div className="ml-auto flex w-fit items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/cra/$period/$consultantId"
              params={{ period, consultantId: row.original.consultantId }}
            >
              {LABELS.cra.show}
            </Link>
          </Button>
          {row.original.decidable && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  onValidate(row.original);
                }}
              >
                {LABELS.preFacturier.validate}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onRefuse(row.original);
                }}
              >
                {LABELS.preFacturier.refuse}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return columns.filter(
    (column) =>
      (role !== 'billing' || column.id !== 'actions') &&
      (role === 'manager' || column.id !== 'marge'),
  );
}

interface PreFacturierScreenProps {
  readonly period: string;
  readonly role: Role;
  readonly craPage: number;
  readonly invoicePage: number;
  readonly pageSize: number;
  readonly consultantSearch: string;
}

/**
 * `/pre-facturier?period=` (task 7.1). The period arrives already resolved — either the visitor
 * picked one, or `routes/_shell/pre-facturier.tsx`'s `beforeLoad` supplied the office's most
 * recent one — so this component never itself decides "no period selected", only "this office has
 * never had one" (`data.period === null`, reachable only if every office Cra vanished between the
 * redirect and this render, kept as a defensive branch rather than an assumed-unreachable one).
 */
export function PreFacturierScreen({
  period,
  role,
  craPage,
  invoicePage,
  pageSize,
  consultantSearch,
}: PreFacturierScreenProps): ReactElement {
  const query = usePreFacturier(period, {
    craPage,
    invoicePage,
    pageSize,
    consultantSearch,
  });
  const navigate = useNavigate();
  const validateMutation = useValidateCra(period);
  const [validationResult, setValidationResult] = useState<{
    readonly cra: PreFacturierCraRow;
    readonly data: ValidationResponse;
  } | null>(null);
  const [refusing, setRefusing] = useState<PreFacturierCraRow | null>(null);

  function submitConsultantSearch(event: SyntheticEvent<HTMLFormElement, SubmitEvent>): void {
    event.preventDefault();
    const entry = new FormData(event.currentTarget).get('consultant-search');
    const search = typeof entry === 'string' ? entry.trim() : '';
    void navigate({
      to: '/pre-facturier',
      search: (previous) => ({
        ...previous,
        consultantSearch: search === '' ? undefined : search,
        craPage: 1,
        invoicePage: 1,
      }),
    });
  }

  /**
   * Validation has no separate confirm step (unlike refusal, it needs no reason and is not
   * destructive) — clicking "Valider" performs the action immediately and the dialog shows its
   * result, exactly as task 7.2 describes it. `replayed: true` is still success (ADR-0021: 200,
   * never 409), so it gets an informational toast rather than the ordinary success one, and the
   * result dialog shows the **original** invoices/declined days either way — "résultat d'origine
   * affiché" is a fact about which toast appears, not about whether the dialog opens.
   */
  async function handleValidate(row: PreFacturierCraRow): Promise<void> {
    try {
      const result = await validateMutation.mutateAsync(row.craId);
      setValidationResult({ cra: row, data: result });
      if (result.replayed) {
        toast.info(LABELS.preFacturier.validateReplayedToast);
      } else {
        toast.success(LABELS.preFacturier.validateSuccessToast);
      }
    } catch (error) {
      toast.error(
        error instanceof ApiProblemError
          ? sentenceFor(error.problem)
          : LABELS.shell.unexpectedErrorBody,
      );
    }
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

  const data = query.data;
  const returnParams = new URLSearchParams({
    period,
    craPage: String(craPage),
    invoicePage: String(invoicePage),
    pageSize: String(pageSize),
  });
  if (consultantSearch !== '') returnParams.set('consultantSearch', consultantSearch);
  const returnTo = `/pre-facturier?${returnParams.toString()}`;

  if (data.period === null) {
    return (
      <EmptyState
        icon={ReceiptTextIcon}
        title={LABELS.preFacturier.noPeriod}
        body={LABELS.preFacturier.noPeriodHint}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector period={period} offered={data.offeredPeriods} />
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <GlossaryTerm term="preFacturier" />
          <GlossaryTerm term="regie" />
          <GlossaryTerm term="forfait" />
          <GlossaryTerm term="intercontrat" />
        </p>
        <CopyLinkButton />
      </div>

      <form className="flex max-w-xl items-end gap-2" onSubmit={submitConsultantSearch}>
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
          {LABELS.preFacturier.searchConsultant}
          <Input
            key={consultantSearch}
            type="search"
            name="consultant-search"
            defaultValue={consultantSearch}
            placeholder={LABELS.preFacturier.searchConsultantPlaceholder}
          />
        </label>
        <Button type="submit" variant="outline">
          {LABELS.preFacturier.search}
        </Button>
        {consultantSearch !== '' && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void navigate({
                to: '/pre-facturier',
                search: (previous) => ({
                  ...previous,
                  consultantSearch: undefined,
                  craPage: 1,
                  invoicePage: 1,
                }),
              });
            }}
          >
            {LABELS.preFacturier.clearSearch}
          </Button>
        )}
      </form>

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={LABELS.preFacturier.summaryBillable}
          value={frenchEuros(data.summary.billableCents)}
        />
        <StatCard
          label={LABELS.preFacturier.summaryLate}
          value={frenchDays(data.summary.lateDays)}
          helpText={LABELS.preFacturier.lateNote}
        />
        <StatCard label={LABELS.preFacturier.summaryCras} value={String(data.summary.craCount)} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-card-title">{LABELS.preFacturier.billable}</h2>
        <DataTable
          columns={invoiceColumns(returnTo)}
          data={data.invoices}
          getRowId={(row) => row.id}
          numericColumns={['lineCount', 'totalTtc']}
          emptyState={
            <EmptyState
              icon={ReceiptTextIcon}
              title={
                consultantSearch === ''
                  ? LABELS.preFacturier.billableEmpty
                  : LABELS.preFacturier.searchEmpty
              }
              body={
                consultantSearch === ''
                  ? LABELS.preFacturier.nothingBlocking
                  : LABELS.preFacturier.searchEmptyBody
              }
            />
          }
        />
        <PaginationControls
          {...data.pagination.invoices}
          onPageChange={(offset) =>
            void navigate({
              to: '/pre-facturier',
              search: (previous) => ({
                ...previous,
                invoicePage: Math.floor(offset / pageSize) + 1,
              }),
            })
          }
          onPageSizeChange={(limit) =>
            void navigate({
              to: '/pre-facturier',
              search: (previous) => ({
                ...previous,
                craPage: 1,
                invoicePage: 1,
                pageSize: limit,
              }),
            })
          }
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-card-title">{LABELS.preFacturier.cras}</h2>
        {role === 'manager' && (
          <p className="text-sm text-muted-foreground">{LABELS.preFacturier.revealNote}</p>
        )}
        <DataTable
          columns={craColumns(
            role,
            period,
            (row) => {
              void handleValidate(row);
            },
            setRefusing,
          )}
          data={data.cras}
          getRowId={(row) => row.craId}
          numericColumns={['recorded']}
          emptyState={
            <EmptyState
              icon={FileTextIcon}
              title={
                consultantSearch === ''
                  ? LABELS.preFacturier.crasEmpty
                  : LABELS.preFacturier.searchEmpty
              }
              body={
                consultantSearch === ''
                  ? LABELS.preFacturier.crasEmptyHint
                  : LABELS.preFacturier.searchEmptyBody
              }
            />
          }
        />
        <PaginationControls
          {...data.pagination.cras}
          onPageChange={(offset) =>
            void navigate({
              to: '/pre-facturier',
              search: (previous) => ({
                ...previous,
                craPage: Math.floor(offset / pageSize) + 1,
              }),
            })
          }
          onPageSizeChange={(limit) =>
            void navigate({
              to: '/pre-facturier',
              search: (previous) => ({
                ...previous,
                craPage: 1,
                invoicePage: 1,
                pageSize: limit,
              }),
            })
          }
        />
      </section>

      {validationResult !== null && (
        <ValidateResultDialog
          cra={validationResult.cra}
          result={validationResult.data}
          onClose={() => {
            setValidationResult(null);
          }}
        />
      )}
      {refusing !== null && (
        <RefuseDialog
          period={period}
          cra={refusing}
          onClose={() => {
            setRefusing(null);
          }}
        />
      )}
    </div>
  );
}
