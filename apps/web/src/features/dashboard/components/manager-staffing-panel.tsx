import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { linkOf, type ActionLink } from '@/components/action-link';
import { VisibilityToggle } from '@/components/visibility-toggle';
import { LABELS } from '@/lib/labels';
import { readLocalPreference, writeLocalPreference } from '@/lib/local-preference';

import type { ManagerStaffing } from '../types';

/**
 * The two entry points into `/affectations`, filtered. The billing
 * dashboard's own `?status=draft` deep link (`features/dashboard/actions.ts`) is the precedent for
 * `ActionLink` over a widened `to: string`; `view=current` matches this chart's own "as of today"
 * scope (ADR-0098), not the dashboard's `period`.
 */
const ON_MISSION_LINK: ActionLink = {
  label: LABELS.dashboard.staffing.openOnMission,
  to: '/affectations',
  search: { view: 'current', staffing: 'on-mission' },
};
const INTERCONTRAT_LINK: ActionLink = {
  label: LABELS.dashboard.staffing.openIntercontrat,
  to: '/affectations',
  search: { view: 'current', staffing: 'intercontrat' },
};

const BAR_WIDTH = 480;
const BAR_HEIGHT = 28;

/** The history section's `erp:dashboard-charts-visible:*` key is deliberately not reused here:
 * this is a different section, and sharing the key would inherit a stale `'false'` from anyone
 * who had collapsed the invoice-history charts this section replaces for managers. */
function staffingVisibleKey(personaKey: string): string {
  return `erp:dashboard-staffing-visible:${personaKey}`;
}

/**
 * The manager's own dashboard chart (ADR-0098) — how many of the office's
 * current consultants are on a client mission versus in `Intercontrat`, **as of today** (the
 * figure's own caption says so, since the rest of this screen is scoped to `period`). One
 * two-segment bar, coloured the same way `invoice-history-chart.tsx`'s `DenseMonthsChart` already
 * fills its single-series bars (`var(--primary)`), with a legend and an `<svg title>` so colour is
 * never the only carrier of the two counts (`direction-visuelle.md` §9).
 *
 * Collapsible with the same `VisibilityToggle`/persisted-preference pattern the company-news
 * module and the history section use, under its own localStorage key.
 */
export function ManagerStaffingPanel({
  personaKey,
  staffing,
}: {
  readonly personaKey: string;
  readonly staffing: ManagerStaffing;
}): ReactElement {
  const labels = LABELS.dashboard.staffing;
  const key = staffingVisibleKey(personaKey);
  const [visible, setVisible] = useState(() => readLocalPreference(key) !== 'false');

  const total = staffing.onMission + staffing.intercontrat;
  const onMissionWidth = total === 0 ? 0 : (staffing.onMission / total) * BAR_WIDTH;
  const intercontratWidth = total === 0 ? 0 : (staffing.intercontrat / total) * BAR_WIDTH;

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-card-title">{labels.heading}</h2>
          <p className="text-xs text-muted-foreground">{labels.caption}</p>
        </div>
        <VisibilityToggle
          visible={visible}
          hideLabel={labels.hide}
          showLabel={labels.show}
          onToggle={() => {
            const next = !visible;
            setVisible(next);
            writeLocalPreference(key, String(next));
          }}
        />
      </div>

      {visible &&
        (total === 0 ? (
          // A deliberate empty state (an office with no active consultant), not a blank bar at
          // 0/0 width — BUILD-RULES: "empty, error and permission-denied states are part of the
          // deliverable."
          <p className="text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <svg
              viewBox={`0 0 ${String(BAR_WIDTH)} ${String(BAR_HEIGHT)}`}
              role="img"
              aria-label={`${labels.heading}. ${labels.onMission} : ${String(staffing.onMission)}. ${labels.intercontrat} : ${String(staffing.intercontrat)}.`}
              className="w-full"
            >
              <title>{labels.heading}</title>
              <rect
                x={0}
                y={0}
                width={onMissionWidth}
                height={BAR_HEIGHT}
                fill="var(--primary)"
                className="transition-[width] duration-300 ease-out"
              >
                <title>
                  {labels.onMission} — {staffing.onMission}
                </title>
              </rect>
              <rect
                x={onMissionWidth}
                y={0}
                width={intercontratWidth}
                height={BAR_HEIGHT}
                fill="var(--border)"
                className="transition-[width] duration-300 ease-out"
              >
                <title>
                  {labels.intercontrat} — {staffing.intercontrat}
                </title>
              </rect>
            </svg>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
              {/* The legend entries are the clickable affordance, not the `<rect>`s above: the
                  `<svg>` is `role="img"` with one `aria-label`, and a click handler on a rect
                  inside it would be keyboard-unreachable and a nested-interactive (WCAG 4.1.2)
                  problem the same way a control inside `SingleSelectCombobox`'s trigger would
                  be. */}
              <Link
                {...linkOf(ON_MISSION_LINK)}
                className="flex items-center gap-1.5 rounded-sm hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--primary)' }}
                />
                {labels.onMission} — {staffing.onMission}
                {/* Content, not `aria-label` — an `aria-label` here would override the visible
                    text above rather than extend it, dropping the count from the accessible name
                    (axe's label-in-name). Same pattern as `invoice-list-screen.tsx`'s own
                    `LABELS.invoice.openFor` span. */}
                <span className="sr-only"> — {labels.openOnMission}</span>
              </Link>
              <Link
                {...linkOf(INTERCONTRAT_LINK)}
                className="flex items-center gap-1.5 rounded-sm hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--border)' }}
                />
                {labels.intercontrat} — {staffing.intercontrat}
                <span className="sr-only"> — {labels.openIntercontrat}</span>
              </Link>
            </div>
          </div>
        ))}
    </section>
  );
}
