import { UserRoundIcon, UsersIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { LABELS } from '@/lib/labels';

import { useOrgChart } from '../hooks';
import type { OrgChartMember } from '../types';

/**
 * Item 18, QA round 3: a small org-chart panel — a consultant's own manager (N+1), or a manager's
 * direct reports (N-1) plus their own manager (N+1). Rendered only for those two roles
 * (`DashboardScreen`'s own call site) — `useOrgChart`'s `GET /api/v1/org-chart` is `forRoles('consultant',
 * 'manager')` (see that route's own comment for why billing has no place in this read).
 *
 * Pending renders nothing rather than a skeleton: this panel is a secondary fact next to the
 * dashboard's own primary queue/cards, which already carry the screen's own loading state, and a
 * skeleton for one small panel would be more noise than the panel is worth. A failed read is
 * different (F14): the section existed and then silently disappeared, with no way to tell "empty"
 * from "broken" — so it keeps its heading and gets one line and a retry button, not a second,
 * competing `ErrorState` card.
 */
export function OrgChartPanel(): ReactElement | null {
  const query = useOrgChart();
  const labels = LABELS.dashboard.orgChart;

  if (query.isPending) return null;

  if (query.isError) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
        <h2 className="text-card-title">{labels.heading}</h2>
        <p className="mt-2 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          {labels.unavailable}
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            {LABELS.problem.retry}
          </Button>
        </p>
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <h2 className="text-card-title">{labels.heading}</h2>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <UserRoundIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">{labels.manager}</span>
          <span className="font-medium text-foreground">
            {data.manager === null ? labels.noManager : data.manager.displayName}
          </span>
        </div>

        {data.role === 'manager' && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <UsersIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">
                {labels.reports.replace('{count}', String(data.reports.length))}
              </span>
            </div>
            {data.reports.length === 0 ? (
              <p className="text-help pl-6">{labels.noReports}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5 pl-6">
                {data.reports.map((report: OrgChartMember) => (
                  <li
                    key={report.id}
                    className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground"
                  >
                    {report.displayName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
