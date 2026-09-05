import { AlertTriangleIcon, ChevronDownIcon, CircleDashedIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { frenchDate, frenchDays, frenchMonth, frenchWeekday } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

import {
  dayTotal,
  isDayIncomplete,
  isDayOverbooked,
  rowTotal,
  valueAt,
  type MatrixState,
} from '../matrix';
import { missionTone } from '../mission-tone';
import type { GridDay } from '../types';

import { CraQuantityCell, type CellQuantity, type NavigationDirection } from './cra-quantity-cell';

/**
 * ADR-0070's matrix, rendered. Pure with respect to the write path — it holds no mutation logic of
 * its own, only local keyboard-focus bookkeeping (`refs`), and calls back through `onChangeCell`.
 * The two callers (`CraGridScreen`'s editable grid, `ManagerCraGridScreen`'s read-only view,
 * ADR-0071) share this component and differ only in `editable`, `onChangeCell` and
 * `renderRowTools`.
 */

export interface MatrixRowMeta {
  readonly key: string;
  readonly label: string;
  /** Position among the visible **mission** rows, for a stable tone (`mission-tone.ts`) — `null`
   * for the Absence row, which gets its own fixed tone instead. */
  readonly toneIndex: number | null;
  /** `null` for Absence — always assignable. A `Set` for a mission row, even one with zero
   * assignable days (a mission whose staffing ended is rendered, inert on every day). */
  readonly assignableDays: ReadonlySet<string> | null;
}

interface CraMatrixTableProps {
  readonly period: string;
  readonly days: readonly GridDay[];
  readonly rows: readonly MatrixRowMeta[];
  readonly matrix: MatrixState;
  readonly editable: boolean;
  readonly flaggedDays: ReadonlySet<string>;
  /** The days a refused submission named (`missing-days.ts`) — empty until one has been refused. */
  readonly missingDays?: ReadonlySet<string> | undefined;
  readonly onChangeCell?: ((rowKey: string, day: string, value: CellQuantity) => void) | undefined;
  readonly renderRowTools?: ((row: MatrixRowMeta) => ReactNode) | undefined;
  /** A seven-day viewport: narrower labels and a total for the visible week, not the month. */
  readonly compact?: boolean;
  readonly totalLabel?: string;
  readonly cellIdPrefix?: string;
}

function dayHeaderLabel(date: string): string {
  const initial = frenchWeekday(date).charAt(0).toUpperCase();
  const dayOfMonth = Number.parseInt(date.slice(8, 10), 10);

  return `${initial} ${String(dayOfMonth)}`;
}

/**
 * ISO-8601 week number, from the date's own digits — no wall-clock read (the three `Date.UTC`
 * calls below only ever receive literal components parsed out of `date`, so the result is a pure
 * function of its argument, unlike the wall-clock reads BUILD-RULES bans in the domain and in
 * tests). This is UI chrome (the header's own week grouping), not a value carried on the wire or
 * compared against anything the API computes, which is why it lives here rather than in
 * `lib/format.ts` alongside the mirror of the API's own formatter.
 */
function isoWeekNumber(date: string): number {
  const year = Number.parseInt(date.slice(0, 4), 10);
  const month = Number.parseInt(date.slice(5, 7), 10);
  const day = Number.parseInt(date.slice(8, 10), 10);

  const target = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = (target.getUTCDay() + 6) % 7; // 0 = Monday
  target.setUTCDate(target.getUTCDate() - isoWeekday + 3); // nearest Thursday

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstIsoWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstIsoWeekday + 3);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const DAYS_PER_WEEK = 7;
  const MS_PER_WEEK = MS_PER_DAY * DAYS_PER_WEEK;

  // No `Math.round` (banned outside a money call site, ADR-0035's rule read broadly): both dates
  // are exact UTC midnights on a Thursday, so their difference is always an exact multiple of a
  // week and `Math.floor` recovers the same integer without inviting the rounding this codebase
  // reserves for money.
  return 1 + Math.floor((target.getTime() - firstThursday.getTime()) / MS_PER_WEEK);
}

/** One entry per run of consecutive days sharing a week number, with its column span — the
 * top-level header row (task 6.4: "numéro de semaine, puis initiale du jour + quantième"). */
function weekGroups(days: readonly GridDay[]): { readonly week: number; readonly span: number }[] {
  const groups: { week: number; span: number }[] = [];
  for (const day of days) {
    const week = isoWeekNumber(day.date);
    const previousSpan = groups.at(-1)?.span;
    if (groups.at(-1)?.week === week && previousSpan !== undefined) {
      groups[groups.length - 1] = { week, span: previousSpan + 1 };
    } else {
      groups.push({ week, span: 1 });
    }
  }

  return groups;
}

function dayTint(day: GridDay): string | undefined {
  if (day.nonWorkable === 'weekend') return 'bg-flag-weekend-bg';
  if (day.nonWorkable === 'publicHoliday') return 'bg-flag-holiday-bg';

  return undefined;
}

/**
 * The two ways a day total can be out of range, and how each is drawn. Both mirror a domain
 * invariant and neither decides anything (ADR-0070): red is a day the save will refuse
 * (`DayOverbookedError`), amber a workable day the submission will (`IncompleteCraError`). Colour
 * is never the only signal — each carries a word under the day number and a sentence on the total.
 */
type TotalTone = 'overbooked' | 'incomplete';

const TOTAL_TONES: Readonly<
  Record<
    TotalTone,
    {
      readonly headerClass: string;
      readonly cellClass: string;
      readonly textClass: string;
      readonly columnLabel: string;
      readonly sentence: string;
    }
  >
> = {
  overbooked: {
    headerClass: 'bg-flag-overbooked-bg text-flag-overbooked-text',
    cellClass: 'bg-flag-overbooked-bg text-flag-overbooked-text',
    textClass: 'text-flag-overbooked-text',
    columnLabel: LABELS.cra.matrix.dayOverbookedColumn,
    sentence: LABELS.cra.matrix.dayOverbooked,
  },
  incomplete: {
    headerClass: 'bg-flag-incomplete-bg text-flag-incomplete-text',
    cellClass: 'bg-flag-incomplete-bg text-flag-incomplete-text',
    textClass: 'text-flag-incomplete-text',
    columnLabel: LABELS.cra.matrix.dayIncompleteColumn,
    sentence: LABELS.cra.matrix.dayIncomplete,
  },
};

function totalTone(
  overbooked: ReadonlySet<string>,
  incomplete: ReadonlySet<string>,
  day: string,
): TotalTone | null {
  if (overbooked.has(day)) return 'overbooked';
  if (incomplete.has(day)) return 'incomplete';

  return null;
}

export function CraMatrixTable({
  period,
  days,
  rows,
  matrix,
  editable,
  flaggedDays,
  missingDays,
  onChangeCell,
  renderRowTools,
  compact = false,
  totalLabel = LABELS.cra.monthTotal,
  cellIdPrefix = 'month',
}: CraMatrixTableProps): ReactElement {
  const refs = useRef(new Map<string, HTMLSelectElement>());

  function refKey(rowKey: string, day: string): string {
    // An escape, not the byte: a raw NUL makes git read this file as binary and lose its diff.
    return `${rowKey}\u0000${day}`;
  }

  function moveFocus(rowKey: string, day: string, direction: NavigationDirection): void {
    const dayIndex = days.findIndex((candidate) => candidate.date === day);
    const rowIndex = rows.findIndex((candidate) => candidate.key === rowKey);
    let targetRow = rowKey;
    let targetDay = day;

    if (direction === 'up') targetRow = rows[rowIndex - 1]?.key ?? rowKey;
    else if (direction === 'down') targetRow = rows[rowIndex + 1]?.key ?? rowKey;
    else if (direction === 'left') targetDay = days[dayIndex - 1]?.date ?? day;
    else if (direction === 'right') targetDay = days[dayIndex + 1]?.date ?? day;
    else if (direction === 'home') targetDay = days[0]?.date ?? day;
    else targetDay = days.at(-1)?.date ?? day;

    refs.current.get(refKey(targetRow, targetDay))?.focus();
  }

  const weeks = weekGroups(days);
  // task 6.2's two day-total signals, each the mirror of a domain invariant — over one day
  // (`DayOverbookedError`) and under it on a workable day (`IncompleteCraError`). Computed once per
  // render rather than inside each cell/header callback below, since the header row and the totals
  // row read the same sets for the same days. A day cannot be in both.
  const overbookedDays = new Set(
    days.filter((day) => isDayOverbooked(matrix, day.date)).map((day) => day.date),
  );
  const incompleteDays = new Set(
    days
      .filter((day) => day.nonWorkable === null)
      .filter((day) => isDayIncomplete(matrix, day.date, missingDays?.has(day.date) ?? false))
      .map((day) => day.date),
  );

  return (
    <div
      role="region"
      aria-label={LABELS.cra.matrix.caption.replace('{month}', frenchMonth(period))}
      // The month is wider than the viewport by design (task 6.4's own "scope-ed header row of 31
      // dates") — axe's `scrollable-region-focusable` (WCAG 2.1.1/2.1.3) requires a scrollable
      // region to be keyboard-reachable itself, not only through the controls inside it.
      // Discovered running the accessibility gate, not assumed.
      tabIndex={0}
      // `pb-3`: a horizontal scrollbar draws on the scrollport's own bottom edge — on an
      // overlay-scrollbar platform that is *over* the last pixel row, not below it, so without this
      // gap the bar sits on top of the "Total du jour" row instead of under it. Reserved
      // unconditionally (never measured against whether a bar is actually showing): the grid is
      // wider than its viewport for every month this mockup seeds.
      // `relative`: `sr-only` is `position: absolute`, so without a positioned ancestor here the
      // `<caption>` and every non-workable day's screen-reader label resolve against the initial
      // containing block — outside this scrollport, which therefore does not clip them, and the
      // *document* pans sideways. Same trap `cra-quantity-cell.tsx` names for its own cells; this
      // is the containing-block form of the fix, which also holds for any `sr-only` added later.
      className="relative overflow-x-auto rounded-xl bg-card pb-3 shadow-card ring-1 ring-border"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {LABELS.cra.matrix.caption.replace('{month}', frenchMonth(period))}
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className={cn('sticky left-0 z-10 bg-card py-1', compact ? 'px-2' : 'px-4')}
            />
            {weeks.map((group) => (
              <th
                // Within one month, ISO week numbers only ever increase — no two groups in `weeks`
                // can share one, so the week number itself is a safe, stable key.
                key={group.week}
                scope="colgroup"
                colSpan={group.span}
                className="border-l border-border px-2 py-1 text-center text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                S{String(group.week)}
              </th>
            ))}
          </tr>
          <tr className="border-b border-border">
            <th
              scope="col"
              className={cn(
                'sticky left-0 z-10 bg-card py-2 text-left',
                compact ? 'w-28 min-w-28 px-2' : 'px-4',
              )}
            >
              {LABELS.cra.activity}
            </th>
            {days.map((day) => {
              const total = totalTone(overbookedDays, incompleteDays, day.date);

              return (
                <th
                  key={day.date}
                  scope="col"
                  className={cn(
                    'border-l border-border px-1 py-2 text-center font-medium whitespace-nowrap',
                    compact ? 'min-w-9' : 'min-w-[2.75rem]',
                    total === null ? dayTint(day) : TOTAL_TONES[total].headerClass,
                    total === null && day.nonWorkable !== null && 'text-muted-foreground',
                  )}
                >
                  <span>{dayHeaderLabel(day.date)}</span>
                  {/* Item 26, QA round 3: the literal "Week-end"/"Jour férié" text used to render
                      here on every non-workable day, eating horizontal space across a whole
                      month's worth of columns — the header cell's own background colour
                      (`dayTint`/`TOTAL_TONES` above) already carries that distinction visually,
                      and the legend below the table (`CraLegend`) now explains what the colour
                      means. `sr-only`, not removed outright, so the same information a sighted
                      reader gets from colour still reaches a screen reader. */}
                  {day.nonWorkable !== null && (
                    <span className="sr-only">{LABELS.cra.nonWorkable[day.nonWorkable]}</span>
                  )}
                  {flaggedDays.has(day.date) && (
                    <span className="block text-[0.6875rem] text-status-late-text">
                      {LABELS.cra.flagged}
                    </span>
                  )}
                  {total !== null && (
                    <span
                      className={cn(
                        'block text-[0.6875rem] font-semibold',
                        TOTAL_TONES[total].textClass,
                      )}
                    >
                      {TOTAL_TONES[total].columnLabel}
                    </span>
                  )}
                </th>
              );
            })}
            <th
              scope="col"
              className="sticky right-0 z-10 border-l border-border bg-card px-3 py-2 text-right"
            >
              {totalLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const tone = row.toneIndex === null ? null : missionTone(row.toneIndex);
            const total = rowTotal(
              matrix,
              row.key,
              days.map((d) => d.date),
            );

            return (
              <tr key={row.key} className="border-b border-border last:border-b-0">
                <th
                  scope="row"
                  className={cn(
                    'sticky left-0 z-10 bg-card py-2 text-left align-middle',
                    compact ? 'w-28 min-w-28 px-2' : 'px-4',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        tone === null ? 'bg-absence-dot' : tone.dotClass,
                      )}
                    />
                    <span
                      className={cn(
                        'font-medium text-foreground',
                        compact && 'max-w-20 truncate text-xs',
                      )}
                    >
                      {row.label}
                    </span>
                    {renderRowTools !== undefined && (
                      <span className="ml-auto flex items-center gap-1">{renderRowTools(row)}</span>
                    )}
                  </div>
                </th>
                {days.map((day) => {
                  const assignable =
                    row.assignableDays === null || row.assignableDays.has(day.date);

                  return (
                    <td
                      key={day.date}
                      className={cn(
                        'border-l border-border p-1 text-center',
                        dayTint(day),
                        tone !== null && assignable && tone.fillClass,
                        row.toneIndex === null && assignable && 'bg-absence-fill',
                      )}
                    >
                      <CraQuantityCell
                        rowKey={`${cellIdPrefix}-${row.key}`}
                        activityLabel={row.label}
                        day={day.date}
                        dayLabel={frenchDate(day.date)}
                        value={valueAt(matrix, row.key, day.date)}
                        editable={editable}
                        assignable={assignable}
                        onChange={(value) => {
                          onChangeCell?.(row.key, day.date, value);
                        }}
                        onNavigate={(direction) => {
                          moveFocus(row.key, day.date, direction);
                        }}
                        registerRef={(element) => {
                          const key = refKey(row.key, day.date);
                          if (element) refs.current.set(key, element);
                          else refs.current.delete(key);
                        }}
                        dayDataAttribute={day.date}
                      />
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 border-l border-border bg-card px-3 py-2 text-right font-medium tabular-nums">
                  {frenchDays(total)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-medium">
            <th
              scope="row"
              className={cn(
                'sticky left-0 z-10 bg-card py-2 text-left',
                compact ? 'w-28 min-w-28 px-2 text-xs' : 'px-4',
              )}
            >
              {LABELS.cra.dayTotal}
            </th>
            {days.map((day) => {
              const tone = totalTone(overbookedDays, incompleteDays, day.date);
              const label = `${LABELS.cra.dayTotal} — ${frenchDate(day.date)}`;
              const Icon = tone === 'incomplete' ? CircleDashedIcon : AlertTriangleIcon;

              return (
                <td
                  key={day.date}
                  // No `title` (ADR-0061) — `aria-label` already carries the same sentence.
                  aria-label={tone === null ? label : `${label} : ${TOTAL_TONES[tone].sentence}`}
                  className={cn(
                    'border-l border-border px-1 py-2 text-center tabular-nums',
                    tone !== null && TOTAL_TONES[tone].cellClass,
                  )}
                >
                  {tone !== null && (
                    <Icon aria-hidden="true" className="mr-0.5 mb-0.5 inline size-3" />
                  )}
                  {frenchDays(dayTotal(matrix, day.date))}
                </td>
              );
            })}
            <td className="sticky right-0 z-10 border-l border-border bg-card px-3 py-2 text-right tabular-nums">
              {frenchDays(days.reduce((total, day) => total + dayTotal(matrix, day.date), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * A9's compact, escapable legend for the two colours and the one word the grid draws directly on
 * cells (`TOTAL_TONES` above, plus `LABELS.cra.flagged`) — collapsed by default, so a reader who
 * already knows the grid pays nothing for it.
 */
export function CraLegend(): ReactElement {
  const swatches: { readonly key: string; readonly className: string; readonly label: string }[] = [
    { key: 'weekend', className: 'bg-flag-weekend-bg', label: LABELS.cra.nonWorkable.weekend },
    {
      key: 'holiday',
      className: 'bg-flag-holiday-bg',
      label: LABELS.cra.nonWorkable.publicHoliday,
    },
    {
      key: 'incomplete',
      className: TOTAL_TONES.incomplete.headerClass,
      label: LABELS.cra.matrix.dayIncomplete,
    },
    {
      key: 'overbooked',
      className: TOTAL_TONES.overbooked.headerClass,
      label: LABELS.cra.matrix.dayOverbooked,
    },
  ];

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="group -ml-2.5 gap-1">
          {LABELS.cra.matrix.legendToggle}
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      {/* Item 6, QA round 5: `--flag-weekend-bg` is the exact same colour as `--background`
          (`styles/globals.css`), so expanded on the page background the weekend swatch was
          literally invisible. `bg-card` alone does not fix that — on `--card` it is still 1.08:1,
          and `--flag-holiday-bg` 1.03:1. The swatches carry their own `ring-1 ring-border` below:
          a near-white fill is what these two flags *mean*, so what has to read is the chip's edge,
          not its fill. Tokens rather than literals throughout. */}
      <CollapsibleContent className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg bg-card p-3 text-xs text-muted-foreground ring-1 ring-border">
        {swatches.map((swatch) => (
          <span key={swatch.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn('size-3 shrink-0 rounded ring-1 ring-border', swatch.className)}
            />
            {swatch.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-status-late-dot" />
          {LABELS.cra.flagged}
        </span>
      </CollapsibleContent>
    </Collapsible>
  );
}
