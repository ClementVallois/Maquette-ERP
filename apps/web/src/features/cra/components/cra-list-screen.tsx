import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

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

import { useCalendar, useCraList } from '../hooks';
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

/**
 * Item 2's own bound: "offer the months the calendar actually covers … derive that bound from the
 * calendar rather than hardcoding it." From the current wall-clock month through December of the
 * calendar's latest known year (`GET /api/v1/calendar`, ADR-0004) — never earlier, this is "the
 * months ahead" — minus whatever the list already carries a row (and therefore an "Ouvrir" button)
 * for.
 */
function offeredFutureMonths(
  years: readonly number[],
  alreadyListed: ReadonlySet<string>,
): string[] {
  if (years.length === 0) return [];
  const maxYear = Math.max(...years);
  const [startYearRaw, startMonthRaw] = currentPeriod().split('-');
  const startYear = Number.parseInt(startYearRaw ?? '0', 10);
  const startMonth = Number.parseInt(startMonthRaw ?? '1', 10);
  if (startYear > maxYear) return [];

  const months: string[] = [];
  for (let year = startYear; year <= maxYear; year += 1) {
    const firstMonth = year === startYear ? startMonth : 1;
    for (let month = firstMonth; month <= 12; month += 1) {
      const period = `${String(year)}-${String(month).padStart(2, '0')}`;
      if (!alreadyListed.has(period)) months.push(period);
    }
  }

  return months;
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

function columnsFor(role: Role): ColumnDef<CraListItem>[] {
  const columns: ColumnDef<CraListItem>[] = [];

  // ADR-0071: a manager's row needs a name to pick a consultant by. A consultant's own list is
  // always their own rows — a "Consultant" column repeating their own name would be noise.
  if (role === 'manager') {
    columns.push({
      id: 'consultantName',
      header: LABELS.cra.consultant,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.consultantName}</span>
      ),
    });
  }

  columns.push(
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
      id: 'recordedQuarterDays',
      header: LABELS.cra.recorded,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchDays(row.original.recordedQuarterDays)}</span>
      ),
    },
  );

  if (role === 'consultant' || role === 'manager') {
    columns.push({
      id: 'actions',
      header: () => <span className="sr-only">{LABELS.action.tableActions}</span>,
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm" className="ml-auto flex w-fit">
          {role === 'consultant' ? (
            <Link to="/cra/$period" params={{ period: row.original.period }}>
              {LABELS.cra.show}
            </Link>
          ) : (
            <Link
              to="/cra/$period/$consultantId"
              params={{ period: row.original.period, consultantId: row.original.consultantId }}
            >
              {LABELS.cra.show}
            </Link>
          )}
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
 * `/cra` (task 6.1, corrected; ADR-0071 for the manager column and action). `GET /api/v1/cras`
 * scopes itself server-side (a consultant sees their own months, a manager the office's —
 * Annexe A). "Ouvrir" now works for both: a consultant reaches their own editable grid, a manager
 * reaches ADR-0071's read-only view of the row's own consultant and period.
 */
export function CraListScreen({ role }: CraListScreenProps): ReactElement {
  const query = useCraList();

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

  const rows = query.data.cras;
  const hasAnyCra = rows.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {role === 'consultant' && (
        <OpenAnotherMonth alreadyListed={new Set(rows.map((row) => row.period))} />
      )}

      <DataTable
        columns={columnsFor(role)}
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

/** Item 2: "un consultant doit pouvoir ouvrir un CRA pour les mois à venir, vierge." */
function OpenAnotherMonth({
  alreadyListed,
}: {
  readonly alreadyListed: ReadonlySet<string>;
}): ReactElement | null {
  const calendar = useCalendar();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | undefined>(undefined);

  if (calendar.isPending || calendar.isError) return null;

  const offered = offeredFutureMonths(calendar.data.years, alreadyListed);
  if (offered.length === 0) {
    return <p className="text-sm text-muted-foreground">{LABELS.cra.noOtherMonthToOpen}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="cra-open-another-month" className="text-label">
          {LABELS.cra.openAnotherMonth}
        </label>
        <Select onValueChange={setPicked}>
          <SelectTrigger id="cra-open-another-month" className="w-48">
            <SelectValue placeholder={LABELS.cra.openAnotherMonthPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {offered.map((period) => (
              <SelectItem key={period} value={period}>
                {frenchMonth(period)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={picked === undefined}
          onClick={() => {
            if (picked !== undefined) {
              void navigate({ to: '/cra/$period', params: { period: picked } });
            }
          }}
        >
          {LABELS.cra.show}
        </Button>
      </div>
      <p className="text-help">{LABELS.cra.openAnotherMonthHint}</p>
    </div>
  );
}
