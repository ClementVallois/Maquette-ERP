import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { TrendingUpIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { GlossaryTerm } from '@/components/glossary-term';
import { StatCard } from '@/components/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { WhyResult } from '@/components/why-result';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDate, frenchDays, frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useConsultantEconomics } from '../hooks';
import type { MissionEconomics } from '../types';

/**
 * ADR-0034's own reference date, recomputed here for display only: `apps/api/src/economics/
 * consultant-economics.ts` resolves both dated rates at `lastDayOf(period)`, a pure calendar
 * function this mirrors the same way `cra-matrix-table.tsx`'s own `isoWeekNumber` mirrors the
 * API's week numbering — UI chrome, not a value compared against anything the API computes.
 */
function lastDayOfPeriod(period: string): string {
  const [year, month] = period.split('-').map((part) => Number.parseInt(part, 10));
  // Day 0 of the following month, UTC: the last calendar day of `period` without a days-in-month
  // table, and without a wall-clock read.
  const last = new Date(Date.UTC(year ?? 0, month ?? 1, 0));

  return `${String(last.getUTCFullYear())}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
}

function MargeSkeleton(): ReactElement {
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

const MISSION_COLUMNS: ColumnDef<MissionEconomics>[] = [
  {
    id: 'mission',
    accessorFn: (row) => row.missionName,
    header: LABELS.margin.mission,
    cell: ({ row }) => (
      <span className="font-medium text-foreground">{row.original.missionName}</span>
    ),
  },
  {
    id: 'quantity',
    accessorFn: (row) => row.quarterDays,
    header: LABELS.margin.quantity,
    cell: ({ row }) => <span className="tabular-nums">{frenchDays(row.original.quarterDays)}</span>,
  },
  {
    id: 'tjm',
    accessorFn: (row) => row.tjmCents,
    // Plain label, not `<GlossaryTerm>` directly: `DataTable` nests a sortable column's `header`
    // inside its own sort `<button>`, and `GlossaryTerm` is itself a Popover-trigger button — one
    // control inside another is axe's `nested-interactive` (WCAG 4.1.2, serious). The term's own
    // trigger moves to `meta.headerAdornment`, rendered as that button's sibling instead.
    header: LABELS.margin.tjm,
    meta: { headerAdornment: <GlossaryTerm term="tjm" /> },
    cell: ({ row }) => <span className="tabular-nums">{frenchEuros(row.original.tjmCents)}</span>,
  },
  {
    id: 'revenue',
    accessorFn: (row) => row.revenueCents,
    header: LABELS.margin.revenue,
    cell: ({ row }) => (
      <span className="tabular-nums">{frenchEuros(row.original.revenueCents)}</span>
    ),
  },
  {
    id: 'cost',
    accessorFn: (row) => row.costCents,
    header: LABELS.margin.cost,
    cell: ({ row }) => <span className="tabular-nums">{frenchEuros(row.original.costCents)}</span>,
  },
  {
    id: 'margin',
    accessorFn: (row) => row.marginCents,
    header: LABELS.margin.margin,
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">{frenchEuros(row.original.marginCents)}</span>
    ),
  },
];

interface MargeScreenProps {
  readonly consultantId: string;
  readonly period: string;
  readonly role: Role;
}

/**
 * `/marge/$consultantId?period=` (task 7.5), manager-only. `Cjm`, `Tjm` and margin exist **only**
 * here (Annexe C.12) — this is the one screen in the SPA allowed to render them, and it renders
 * every one of the three the wire carries: `Cjm` in the header, `Tjm` per mission, margin per
 * mission and as a total. No margin **rate** (%): a division on money the plan explicitly refuses
 * (task 7.5, "une division sur de l'argent").
 */
export function MargeScreen({ consultantId, period, role }: MargeScreenProps): ReactElement {
  const query = useConsultantEconomics(consultantId, period);

  if (query.isPending) return <MargeSkeleton />;

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
          onRetry={() => void query.refetch()}
          {...(error.problem.correlationId === undefined
            ? {}
            : { correlationId: error.problem.correlationId })}
        />
      );
    }

    return (
      <ErrorState
        title={LABELS.problem.heading.internal}
        body={LABELS.shell.unexpectedErrorBody}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <div>
            <h2 className="text-card-title">{data.displayName}</h2>
            <p className="text-sm text-muted-foreground">{frenchMonth(data.period)}</p>
          </div>
          <WhyResult
            trigger={LABELS.margin.whyResult.trigger}
            title={LABELS.margin.whyResult.title}
          >
            <li>{LABELS.margin.whyResult.revenueFormula}</li>
            <li>{LABELS.margin.whyResult.costFormula}</li>
            <li>{LABELS.margin.whyResult.marginFormula}</li>
            <li>
              {LABELS.margin.whyResult.referenceDate.replace(
                '{date}',
                frenchDate(lastDayOfPeriod(data.period)),
              )}
            </li>
            <li>{LABELS.margin.noMission}</li>
          </WhyResult>
        </div>
        <StatCard
          label={<GlossaryTerm term="cjm" />}
          value={frenchEuros(data.cjmCents)}
          className="w-48"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label={LABELS.margin.revenue} value={frenchEuros(data.revenueCents)} />
        <StatCard label={LABELS.margin.cost} value={frenchEuros(data.costCents)} />
        <StatCard label={LABELS.margin.margin} value={frenchEuros(data.marginCents)} />
      </div>

      <DataTable
        columns={MISSION_COLUMNS}
        data={data.missions}
        getRowId={(row) => row.missionId}
        numericColumns={['quantity', 'tjm', 'revenue', 'cost', 'margin']}
        emptyState={
          <EmptyState
            icon={TrendingUpIcon}
            title={LABELS.margin.noMissionTitle}
            body={LABELS.margin.noMission}
          />
        }
      />

      <Link
        to="/pre-facturier"
        search={{ period }}
        className="w-fit text-sm text-primary hover:underline"
      >
        {LABELS.margin.back}
      </Link>
    </div>
  );
}
