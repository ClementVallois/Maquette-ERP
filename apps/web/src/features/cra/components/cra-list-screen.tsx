import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
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
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDays, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useCraList } from '../hooks';
import type { CraListItem, CraStatus } from '../types';

const STATUS_VARIANT: Record<CraStatus, StatusBadgeVariant> = {
  draft: 'cra-draft',
  submitted: 'cra-submitted',
  validated: 'cra-validated',
  refused: 'cra-refused',
};

/** The current wall-clock month, `YYYY-MM` — the seed's own calendar lives in 2026, and the demo
 * runs in real time against it, so "the period a brand-new consultant should open first" is
 * genuinely today's month, not a value the seed dictates. */
function currentPeriod(): string {
  const now = new Date();

  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function ListSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

interface RowProps {
  readonly canOpen: boolean;
}

function columnsFor({ canOpen }: RowProps): ColumnDef<CraListItem>[] {
  const columns: ColumnDef<CraListItem>[] = [
    {
      id: 'period',
      header: LABELS.cra.period,
      accessorFn: (row) => row.period,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{frenchMonth(row.original.period)}</span>
      ),
    },
    {
      id: 'status',
      header: LABELS.cra.status,
      cell: ({ row }) => <StatusBadge variant={STATUS_VARIANT[row.original.status]} />,
    },
    {
      id: 'recordedHalfDays',
      header: LABELS.cra.recorded,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchDays(row.original.recordedHalfDays)}</span>
      ),
    },
  ];

  if (canOpen) {
    columns.push({
      id: 'actions',
      header: () => <span className="sr-only">{LABELS.action.tableActions}</span>,
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm" className="ml-auto flex w-fit">
          <Link to="/cra/$period" params={{ period: row.original.period }}>
            {LABELS.cra.show}
          </Link>
        </Button>
      ),
    });
  }

  return columns;
}

interface CraListScreenProps {
  readonly role: Role;
}

/**
 * `/cra` (task 6.1). `GET /api/v1/cras` scopes itself server-side (a consultant sees their own
 * months, a manager the office's — Annexe A) but this phase's "Ouvrir" action only ever leads
 * somewhere that answers: `GET /api/v1/cras/:period/grid` is `forRoles('consultant')` with no
 * consultant id on the path (it is always the caller's own month), so a manager's click would be a
 * guaranteed `insufficient-role`. The action column is therefore only rendered for `consultant`
 * (`docs/open-questions.md`, row dated 25/08/2026, names the manager-facing "CRA" nav entry this
 * leaves without a working destination — Phase 7's pré-facturier is where a manager reviews a
 * named consultant's month today).
 *
 * The period filter is **client-side only**: `GET /api/v1/cras` takes no `period` query parameter
 * (only `limit`/`offset`), and Annexe C.10's own reading — never guess a contract — rules out
 * sending one on the hope the route accepts it silently.
 */
export function CraListScreen({ role }: CraListScreenProps): ReactElement {
  const query = useCraList();
  const [periodFilter, setPeriodFilter] = useState<string>('all');

  const periods = useMemo(() => {
    const distinct = new Set((query.data?.cras ?? []).map((row) => row.period));

    return [...distinct].sort((a, b) => b.localeCompare(a));
  }, [query.data]);

  const rows = useMemo(() => {
    const all = query.data?.cras ?? [];

    return periodFilter === 'all' ? all : all.filter((row) => row.period === periodFilter);
  }, [query.data, periodFilter]);

  if (query.isPending) return <ListSkeleton />;

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

  const hasAnyCra = query.data.cras.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {periods.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="cra-period-filter" className="text-label">
            {LABELS.cra.filter}
          </label>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger id="cra-period-filter" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{LABELS.cra.allPeriods}</SelectItem>
              {periods.map((period) => (
                <SelectItem key={period} value={period}>
                  {frenchMonth(period)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <DataTable
        columns={columnsFor({ canOpen: role === 'consultant' })}
        data={rows}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            icon={CalendarIcon}
            title={LABELS.cra.emptyList}
            body={LABELS.cra.emptyListHint}
            {...(!hasAnyCra && role === 'consultant'
              ? { action: { label: LABELS.cra.show, to: `/cra/${currentPeriod()}` } }
              : {})}
          />
        }
      />
    </div>
  );
}
