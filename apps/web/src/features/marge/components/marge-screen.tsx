import { Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { TrendingUpIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { StatCard } from '@/components/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useConsultantEconomics } from '../hooks';
import type { MissionEconomics } from '../types';

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
    header: LABELS.margin.mission,
    cell: ({ row }) => (
      <span className="font-medium text-foreground">{row.original.missionName}</span>
    ),
  },
  {
    id: 'quantity',
    header: LABELS.margin.quantity,
    cell: ({ row }) => <span className="tabular-nums">{row.original.quarterDays}</span>,
  },
  {
    id: 'tjm',
    header: LABELS.margin.tjm,
    cell: ({ row }) => <span className="tabular-nums">{frenchEuros(row.original.tjmCents)}</span>,
  },
  {
    id: 'revenue',
    header: LABELS.margin.revenue,
    cell: ({ row }) => (
      <span className="tabular-nums">{frenchEuros(row.original.revenueCents)}</span>
    ),
  },
  {
    id: 'cost',
    header: LABELS.margin.cost,
    cell: ({ row }) => <span className="tabular-nums">{frenchEuros(row.original.costCents)}</span>,
  },
  {
    id: 'margin',
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-card-title">{data.displayName}</h2>
          <p className="text-sm text-muted-foreground">{frenchMonth(data.period)}</p>
        </div>
        <StatCard label={LABELS.margin.cjm} value={frenchEuros(data.cjmCents)} className="w-48" />
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
