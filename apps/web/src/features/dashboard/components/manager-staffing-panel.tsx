import type { ReactElement } from 'react';
import { useState } from 'react';

import { VisibilityToggle } from '@/components/visibility-toggle';
import { LABELS } from '@/lib/labels';
import { readLocalPreference, writeLocalPreference } from '@/lib/local-preference';

import type { ManagerStaffing } from '../types';

const BAR_WIDTH = 480;
const BAR_HEIGHT = 28;

/** Item 23's own `erp:dashboard-charts-visible:*` key is deliberately not reused here — this is a
 * different section with different content, and reusing it would inherit a stale `'false'` from
 * anyone who had collapsed the invoice-history charts this section replaces for managers. */
function staffingVisibleKey(personaKey: string): string {
  return `erp:dashboard-staffing-visible:${personaKey}`;
}

/**
 * Item 3, QA round 5 (ADR-0098): the manager's own dashboard chart — how many of the office's
 * current consultants are on a client mission versus in `Intercontrat`, **as of today** (the
 * figure's own caption says so, since the rest of this screen is scoped to `period`). One
 * two-segment bar, coloured the same way `invoice-history-chart.tsx`'s `DenseMonthsChart` already
 * fills its single-series bars (`var(--primary)`), with a legend and an `<svg title>` so colour is
 * never the only carrier of the two counts (`direction-visuelle.md` §9).
 *
 * Collapsible with the same `VisibilityToggle`/persisted-preference pattern the company-news
 * module and the (now manager/billing-less) history section already use, under its own
 * localStorage key.
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
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--primary)' }}
                />
                {labels.onMission} — {staffing.onMission}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--border)' }}
                />
                {labels.intercontrat} — {staffing.intercontrat}
              </span>
            </div>
          </div>
        ))}
    </section>
  );
}
