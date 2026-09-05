import { Link } from '@tanstack/react-router';
import type { ReactElement, ReactNode } from 'react';

import { linkOf, type ActionLink } from '@/components/action-link';
import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDate, frenchDays, frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { currentPeriod } from '@/lib/period';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { callToAction } from '../actions';
import { useDashboard } from '../hooks';
import type {
  BillingDashboard,
  ConsultantDashboard,
  DashboardActivity,
  DashboardCraStatus,
  DashboardResponse,
  ManagerDashboard,
} from '../types';

import { BillingChartsPlaceholder } from './billing-charts-placeholder';
import { CompanyNewsPanel } from './company-news-panel';
import { ManagerStaffingPanel } from './manager-staffing-panel';
import { OrgChartPanel } from './org-chart-panel';

/** The dense months the seed actually fills — A5's escape hatch off a genuinely blank one. */
const MONTHS_WITH_DATA = ['2026-06', '2026-07', '2026-08'] as const;

function DashboardSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
 * `action` is optional (F11): a current month `consultantQueue` already carries as the work
 * queue's own primary "à faire maintenant" row renders here as a **summary sentence with no
 * button** — the queue above is the one place that action lives, so this card does not repeat it.
 * Only a status `consultantQueue` never lists (`validated`, nothing left to do) keeps its button.
 *
 * Where it points is decided in `../actions.ts`, as data: the destination is a typed `LinkProps`,
 * so a search param cannot be smuggled into `to` as a query string (which TanStack Router does
 * not parse — that module's header says why). */
function ActionCard({
  sentence,
  action,
}: {
  readonly sentence: string;
  readonly action?: ActionLink;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <p className="text-sm text-foreground">{sentence}</p>
      {action !== undefined && (
        <Button asChild size="sm">
          <Link {...linkOf(action)}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}

/** One row of any role's "à faire maintenant" queue: a fact, an optional age, a link to the
 * exact object — never to a screen the visitor has to search on. */
interface QueueItem {
  readonly key: string;
  readonly primary: string;
  readonly secondary?: string;
  readonly action: ActionLink;
}

/** `statusChangedAt`/similar ISO timestamps → "Depuis N jours", the work queue's one age format. */
function ageSentence(iso: string | null): string | undefined {
  if (iso === null) return undefined;
  const labels = LABELS.dashboard.queue;
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  if (days === 0) return labels.ageToday;
  if (days === 1) return labels.ageOneDay;
  return labels.ageManyDays.replace('{days}', String(days));
}

function WorkQueue({ items }: { readonly items: readonly QueueItem[] }): ReactElement {
  const labels = LABELS.dashboard.queue;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-card-title">{labels.now}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.nowEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between gap-4 rounded-xl bg-card p-4 shadow-card ring-1 ring-border"
            >
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{item.primary}</span>
                {item.secondary !== undefined && (
                  <span className="text-xs text-muted-foreground">{item.secondary}</span>
                )}
              </div>
              <Button asChild size="sm" variant="outline">
                <Link {...linkOf(item.action)}>{item.action.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function activitySentence(item: DashboardActivity): string {
  if (item.kind === 'invoice') {
    return `${item.name ?? LABELS.invoice.heading} — ${LABELS.preFacturier.invoiceStatuses[item.status as 'issued' | 'cancelledByCreditNote']}`;
  }

  const subject = item.name ?? LABELS.cra.heading;
  return `${subject} — ${LABELS.cra.statuses[item.status as DashboardCraStatus]}`;
}

function RecentActivity({ data }: { readonly data: DashboardResponse }): ReactElement {
  const labels = LABELS.dashboard.queue;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-card-title">{labels.recentActivity}</h2>
      {data.recentActivity.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.recentActivityEmpty}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.recentActivity.map((item) => {
            const content = (
              <>
                <span className="font-medium text-foreground">{activitySentence(item)}</span>
                <span className="text-xs text-muted-foreground">
                  {frenchMonth(item.period)} · {frenchDate(item.at.slice(0, 10))}
                </span>
              </>
            );

            return (
              <li key={item.key} className="rounded-xl bg-card shadow-card ring-1 ring-border">
                {item.kind === 'invoice' ? (
                  <Link
                    to="/factures/$id"
                    params={{ id: item.recordId }}
                    className="flex flex-col gap-1 p-4 hover:bg-muted/40"
                  >
                    {content}
                  </Link>
                ) : data.role === 'manager' && item.consultantId !== undefined ? (
                  <Link
                    to="/cra/$period/$consultantId"
                    params={{ period: item.period, consultantId: item.consultantId }}
                    className="flex flex-col gap-1 p-4 hover:bg-muted/40"
                  >
                    {content}
                  </Link>
                ) : (
                  <Link
                    to="/cra/$period"
                    params={{ period: item.period }}
                    className="flex flex-col gap-1 p-4 hover:bg-muted/40"
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** A5: today's wall-clock month is deliberately blank in the seed (September, reserved for the
 * interactive create/submit/validate journey) — rather than fake data into it, every empty
 * dashboard offers a direct link to a month the seed actually filled. */
function SeeMonthsWithData({ period }: { readonly period: string }): ReactElement {
  const labels = LABELS.dashboard.queue;
  const offered = MONTHS_WITH_DATA.filter((month) => month !== period);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-card ring-1 ring-border">
      <p className="text-sm text-muted-foreground">{labels.emptyMonthNotice}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{labels.seeMonthsWithData}</span>
        {offered.map((month) => (
          <Button asChild key={month} size="sm" variant="outline">
            <Link to="/tableau-de-bord" search={{ period: month }}>
              {frenchMonth(month)}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

const CONSULTANT_STATUS_LABEL: Record<NonNullable<ConsultantDashboard['myMonthStatus']>, string> = {
  draft: LABELS.cra.statuses.draft,
  submitted: LABELS.cra.statuses.submitted,
  validated: LABELS.cra.statuses.validated,
  refused: LABELS.cra.statuses.refused,
};

function consultantQueue(data: ConsultantDashboard): readonly QueueItem[] {
  const labels = LABELS.dashboard.consultant;
  const items: QueueItem[] = [];

  if (data.myMonthStatus !== 'validated') {
    items.push({
      key: `own-${data.period}`,
      primary: `${frenchMonth(data.period)} — ${data.myMonthStatus === null ? labels.monthStatusNone : CONSULTANT_STATUS_LABEL[data.myMonthStatus]}`,
      secondary: data.myMonthStatus === null ? labels.hints.none : labels.hints[data.myMonthStatus],
      action: { label: labels.open, to: '/cra/$period', params: { period: data.period } },
    });
  }

  for (const period of data.refusedPeriods) {
    if (period === data.period) continue;
    items.push({
      key: `refused-${period}`,
      primary: frenchMonth(period),
      secondary: labels.refusedElsewhere.replace('{month}', frenchMonth(period)),
      action: { label: labels.openRefused, to: '/cra/$period', params: { period } },
    });
  }

  return items;
}

function managerQueue(data: ManagerDashboard): readonly QueueItem[] {
  const labels = LABELS.dashboard.manager;

  return data.awaitingDecision.map((row) => {
    const age = ageSentence(row.statusChangedAt);

    return {
      key: row.craId,
      primary: `${row.consultantName} — ${frenchMonth(row.period)}`,
      ...(age === undefined ? {} : { secondary: age }),
      // Rank A1's own fix: this used to open the pré-facturier for the *displayed* period, not
      // the row's own — a counter naming work and a button leading nowhere near it.
      // Item 21, QA round 3: now opens the consultant's own CRA directly (the row's period, not
      // the displayed one — same reasoning as the pré-facturier link it replaces) rather than the
      // pré-facturier list the manager then had to search again.
      action: {
        label: labels.decide,
        to: '/cra/$period/$consultantId',
        params: { period: row.period, consultantId: row.consultantId },
      },
    };
  });
}

function billingQueue(data: BillingDashboard): readonly QueueItem[] {
  return data.oldestDrafts.map((row) => ({
    key: row.invoiceId,
    primary: `${row.billedToName} — ${frenchMonth(row.supplyPeriod)}`,
    secondary: frenchEuros(row.totalTtcCents),
    action: { label: LABELS.invoice.open, to: '/factures/$id', params: { id: row.invoiceId } },
  }));
}

function queueOf(data: DashboardResponse): readonly QueueItem[] {
  switch (data.role) {
    case 'consultant':
      return consultantQueue(data);
    case 'manager':
      return managerQueue(data);
    case 'billing':
      return billingQueue(data);
  }
}

function ConsultantCards({ data }: { readonly data: ConsultantDashboard }): ReactElement {
  const labels = LABELS.dashboard.consultant;
  const status = data.myMonthStatus;
  // ADR-0097 removed the *other-month* duplicate (`RefusedElsewhereNotices`, which repeated
  // `consultantQueue`'s own refused-elsewhere row). F11 completes that decision for the
  // *current*-month one: `consultantQueue` already lists this period for every status but
  // `validated` (a validated month is not "à faire maintenant"), with the identical fact, label
  // and destination `ActionCard` used to repeat here. Only `validated` — absent from the queue —
  // keeps the button; every other status shows the summary sentence alone.
  const { sentence, action } = callToAction(data);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={labels.monthStatus}
          value={status === null ? labels.monthStatusNone : CONSULTANT_STATUS_LABEL[status]}
        />
        <StatCard label={labels.recorded} value={frenchDays(data.recordedQuarterDays)} />
        <StatCard label={labels.remaining} value={String(data.remainingWorkableDays)} />
      </div>
      <ActionCard sentence={sentence} {...(status === 'validated' ? { action } : {})} />
    </div>
  );
}

/**
 * Item 22, QA round 3: `StatCard` wrapped in a `Link` rather than a `to`/`onNavigate` prop added
 * to `StatCard` itself — that component is shared with the two counts below that stay plain
 * (§ "Billable ce mois", `BillingCards`' own three), and a stat card that only *sometimes*
 * navigates is a worse interface than a plain card a caller can choose to wrap.
 */
function StatCardLink({
  to,
  search,
  children,
}: {
  readonly to: '/cra';
  readonly search: { readonly statuses: DashboardCraStatus[]; readonly beforePeriod?: string };
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Link
      to={to}
      search={search}
      className="block rounded-xl transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

function ManagerCards({ data }: { readonly data: ManagerDashboard }): ReactElement {
  const labels = LABELS.dashboard.manager;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Item 22, QA round 3: both cards below deep-link to `/cra`, filtered to exactly what
            they count. ADR-0082: these counts are never scoped to the displayed period — the
            link omits `year`/`month` entirely (not merely leaves them at their current value) so
            the list agrees with the count instead of silently narrowing to the wrong month. */}
        <StatCardLink to="/cra" search={{ statuses: ['submitted'] }}>
          <StatCard label={labels.pending} value={String(data.pendingDecisions)} />
        </StatCardLink>
        <StatCard label={labels.billable} value={frenchEuros(data.billableCents)} />
        {/* "En retard" = not validated AND the period has closed (`lateCras`,
            `apps/api/src/routes/api.ts`) — `beforePeriod` is the exact server-side equivalent
            (`CraListQuery`'s own doc comment has the proof), computed from this browser's own
            clock the same way `currentPeriod()`'s other caller (the "months ahead" picker)
            already does. */}
        <StatCardLink
          to="/cra"
          search={{ statuses: ['draft', 'submitted', 'refused'], beforePeriod: currentPeriod() }}
        >
          <StatCard label={labels.late} value={String(data.lateCras)} />
        </StatCardLink>
      </div>
    </div>
  );
}

function BillingCards({ data }: { readonly data: BillingDashboard }): ReactElement {
  const labels = LABELS.dashboard.billing;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label={labels.draft} value={String(data.draftInvoices)} />
        <StatCard label={labels.issued} value={String(data.issuedInvoices)} />
        <StatCard label={labels.totalIssued} value={frenchEuros(data.totalTtcIssuedCents)} />
      </div>
    </div>
  );
}

/** Whether this role's month reads as genuinely empty — the A5 trigger for `SeeMonthsWithData`. */
function isEmpty(data: DashboardResponse): boolean {
  switch (data.role) {
    case 'consultant':
      return (
        data.myMonthStatus === null &&
        data.recordedQuarterDays === 0 &&
        data.refusedPeriods.length === 0
      );
    case 'manager':
      return data.pendingDecisions === 0 && data.billableCents === 0 && data.lateCras === 0;
    case 'billing':
      return (
        data.draftInvoices === 0 && data.issuedInvoices === 0 && data.oldestDrafts.length === 0
      );
  }
}

interface DashboardScreenProps {
  readonly role: Role;
  readonly period: string;
  /** Items 17/23, QA round 3: scopes the two collapsible panels' localStorage preference —
   * `lib/local-preference.ts`'s own header explains why an unscoped key would leak. */
  readonly personaKey: string;
}

/**
 * `/tableau-de-bord` (task 8.4) — the first screen after the persona selector. `GET
 * /api/v1/dashboard?period=` answers a discriminated union keyed by `role`
 * (`features/dashboard/types.ts`'s own header explains why the Phase 3 placeholder had the wrong
 * shape); this component picks the card set matching it. Rank A1 adds the three tiers and rank A3
 * fills recent activity from persisted lifecycle timestamps.
 */
export function DashboardScreen({ role, period, personaKey }: DashboardScreenProps): ReactElement {
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
  const queue = queueOf(data);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{frenchMonth(data.period)}</p>

      <WorkQueue items={queue} />

      {isEmpty(data) && <SeeMonthsWithData period={data.period} />}

      <section className="flex flex-col gap-4">
        <h2 className="text-card-title">{LABELS.dashboard.queue.thisMonth}</h2>
        {data.role === 'consultant' && <ConsultantCards data={data} />}
        {data.role === 'manager' && <ManagerCards data={data} />}
        {data.role === 'billing' && <BillingCards data={data} />}
      </section>

      <CompanyNewsPanel personaKey={personaKey} />

      {data.role === 'manager' && (
        <ManagerStaffingPanel personaKey={personaKey} staffing={data.staffing} />
      )}
      {data.role === 'billing' && <BillingChartsPlaceholder />}

      {(data.role === 'consultant' || data.role === 'manager') && <OrgChartPanel />}

      <RecentActivity data={data} />
    </div>
  );
}
