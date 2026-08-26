import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { FileTextIcon, ReceiptTextIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/data-table';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { StatCard } from '@/components/stat-card';
import { StatusBadge, type StatusBadgeVariant } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCraList } from '@/features/cra/hooks';
import type { CraStatus, ValidationResponse } from '@/features/cra/types';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDays, frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { usePreFacturier, useValidateCra } from '../hooks';
import type { DeclineReason, PreFacturierCraRow, PreFacturierInvoiceRow } from '../types';

import { RefuseDialog } from './refuse-dialog';
import { ValidateResultDialog } from './validate-result-dialog';

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

/** Sorted-descending, deduplicated periods — the same rule the server's own `offeredPeriods`
 * (`apps/api/src/composition/pre-facturier.ts`) applies, ported here because the JSON route
 * (unlike the SSR page) does not put that list on the wire (`docs/open-questions.md`, row dated
 * 2026-08-26). Derived from `GET /api/v1/cras`, already scoped server-side the same way the
 * pré-facturier itself is (office for a manager, office for billing — verified against
 * `pg-cra-repository.ts`'s `list()`). */
function offeredPeriods(periods: readonly string[]): string[] {
  return [...new Set(periods)].sort((left, right) => right.localeCompare(left));
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

function invoiceColumns(): ColumnDef<PreFacturierInvoiceRow>[] {
  return [
    {
      id: 'client',
      header: LABELS.preFacturier.client,
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
      id: 'invoiceNumber',
      header: LABELS.preFacturier.invoiceNumber,
      cell: ({ row }) => (
        <span className="font-mono text-[0.8125rem] tabular-nums">
          {row.original.invoiceNumber ?? LABELS.preFacturier.notNumberedYet}
        </span>
      ),
    },
    {
      id: 'totalTtc',
      header: LABELS.preFacturier.totalIncludingVat,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.totalTtcCents === null
            ? LABELS.preFacturier.notNumberedYet
            : frenchEuros(row.original.totalTtcCents)}
        </span>
      ),
    },
  ];
}

function craColumns(
  role: Role,
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
      header: LABELS.preFacturier.consultant,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.consultantName}</span>
      ),
    },
    {
      id: 'status',
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
      header: LABELS.preFacturier.recorded,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchDays(row.original.recordedQuarterDays)}</span>
      ),
    },
    {
      id: 'blocking',
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
    // `role` decides nothing here: `decidable` is already the server's own combination of role and
    // status (`mayDecide && status === 'submitted'`, `composition/pre-facturier.ts`) — repeating a
    // role check client-side would be a second copy of the same rule, not a second control.
    {
      id: 'actions',
      header: () => <span className="sr-only">{LABELS.action.tableActions}</span>,
      cell: ({ row }) =>
        row.original.decidable ? (
          <div className="ml-auto flex w-fit gap-2">
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
          </div>
        ) : null,
    },
  ];

  return columns.filter((column) => role !== 'billing' || column.id !== 'actions');
}

interface PreFacturierScreenProps {
  readonly period: string;
  readonly role: Role;
}

/**
 * `/pre-facturier?period=` (task 7.1). The period arrives already resolved — either the visitor
 * picked one, or `routes/_shell/pre-facturier.tsx`'s `beforeLoad` supplied the office's most
 * recent one — so this component never itself decides "no period selected", only "this office has
 * never had one" (`data.period === null`, reachable only if every office Cra vanished between the
 * redirect and this render, kept as a defensive branch rather than an assumed-unreachable one).
 */
export function PreFacturierScreen({ period, role }: PreFacturierScreenProps): ReactElement {
  const query = usePreFacturier(period);
  const craList = useCraList();
  const validateMutation = useValidateCra(period);
  const [validationResult, setValidationResult] = useState<{
    readonly cra: PreFacturierCraRow;
    readonly data: ValidationResponse;
  } | null>(null);
  const [refusing, setRefusing] = useState<PreFacturierCraRow | null>(null);

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
  const offered = offeredPeriods([...(craList.data?.cras.map((cra) => cra.period) ?? []), period]);

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
      <PeriodSelector period={period} offered={offered} />

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
          columns={invoiceColumns()}
          data={data.invoices}
          getRowId={(row) => row.id}
          emptyState={
            <EmptyState
              icon={ReceiptTextIcon}
              title={LABELS.preFacturier.billableEmpty}
              body={LABELS.preFacturier.nothingBlocking}
            />
          }
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-card-title">{LABELS.preFacturier.cras}</h2>
        <DataTable
          columns={craColumns(
            role,
            (row) => {
              void handleValidate(row);
            },
            setRefusing,
          )}
          data={data.cras}
          getRowId={(row) => row.craId}
          emptyState={
            <EmptyState
              icon={FileTextIcon}
              title={LABELS.preFacturier.crasEmpty}
              body={LABELS.preFacturier.crasEmptyHint}
            />
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
