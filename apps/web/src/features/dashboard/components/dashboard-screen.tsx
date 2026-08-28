import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDays, frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { callToAction, type DashboardCallToAction } from '../actions';
import { useDashboard } from '../hooks';
import type { BillingDashboard, ConsultantDashboard, ManagerDashboard } from '../types';

function DashboardSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

/** The "1 Cra en attente de votre décision → pré-facturier" shape task 8.4 names by example: one
 * sentence stating the fact, one button carrying the visitor to the screen that acts on it. Never
 * a second copy of a StatCard's own figure — the sentence names what to *do*, the cards above it
 * already named what the figure *is*.
 *
 * Where it points is decided in `../actions.ts`, as data: the destination is a typed `LinkProps`,
 * so a search param cannot be smuggled into `to` as a query string (which TanStack Router does
 * not parse — that module's header says why). */
function ActionCard({ sentence, action }: DashboardCallToAction): ReactElement {
  const { label, ...link } = action;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <p className="text-sm text-foreground">{sentence}</p>
      <Button asChild size="sm">
        <Link {...link}>{label}</Link>
      </Button>
    </div>
  );
}

const CONSULTANT_STATUS_LABEL: Record<NonNullable<ConsultantDashboard['myMonthStatus']>, string> = {
  draft: LABELS.cra.statuses.draft,
  submitted: LABELS.cra.statuses.submitted,
  validated: LABELS.cra.statuses.validated,
  refused: LABELS.cra.statuses.refused,
};

function ConsultantCards({ data }: { readonly data: ConsultantDashboard }): ReactElement {
  const labels = LABELS.dashboard.consultant;
  const status = data.myMonthStatus;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={labels.monthStatus}
          value={status === null ? labels.monthStatusNone : CONSULTANT_STATUS_LABEL[status]}
        />
        <StatCard label={labels.recorded} value={frenchDays(data.recordedQuarterDays)} />
        <StatCard label={labels.remaining} value={String(data.remainingWorkableDays)} />
      </div>
      <ActionCard {...callToAction(data)} />
    </div>
  );
}

function ManagerCards({ data }: { readonly data: ManagerDashboard }): ReactElement {
  const labels = LABELS.dashboard.manager;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={labels.pending} value={String(data.pendingDecisions)} />
        <StatCard label={labels.billable} value={frenchEuros(data.billableCents)} />
        <StatCard label={labels.late} value={String(data.lateCras)} />
      </div>
      <ActionCard {...callToAction(data)} />
    </div>
  );
}

function BillingCards({ data }: { readonly data: BillingDashboard }): ReactElement {
  const labels = LABELS.dashboard.billing;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label={labels.draft} value={String(data.draftInvoices)} />
        <StatCard label={labels.issued} value={String(data.issuedInvoices)} />
        <StatCard label={labels.totalIssued} value={frenchEuros(data.totalTtcIssuedCents)} />
      </div>
      <ActionCard {...callToAction(data)} />
    </div>
  );
}

interface DashboardScreenProps {
  readonly role: Role;
  readonly period: string;
}

/**
 * `/tableau-de-bord` (task 8.4) — the first screen after the persona selector, "polish maximal".
 * `GET /api/v1/dashboard?period=` answers a discriminated union keyed by `role`
 * (`features/dashboard/types.ts`'s own header explains why the Phase 3 placeholder had the wrong
 * shape); this component's whole job is picking the one card set that matches. No chart: the seed
 * holds one period, and a curve on one point is the visual lie task 8.4 explicitly refuses.
 */
export function DashboardScreen({ role, period }: DashboardScreenProps): ReactElement {
  const query = useDashboard(period);

  if (query.isPending) return <DashboardSkeleton />;

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
      <p className="text-sm text-muted-foreground">{frenchMonth(data.period)}</p>
      {data.role === 'consultant' && <ConsultantCards data={data} />}
      {data.role === 'manager' && <ManagerCards data={data} />}
      {data.role === 'billing' && <BillingCards data={data} />}
    </div>
  );
}
