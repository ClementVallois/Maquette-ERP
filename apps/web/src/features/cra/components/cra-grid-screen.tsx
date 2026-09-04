import { Link, useBlocker } from '@tanstack/react-router';
import {
  CopyIcon,
  EraserIcon,
  ListChecksIcon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
import { GlossaryTerm } from '@/components/glossary-term';
import { TogglePillGroup } from '@/components/toggle-pill-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDate, frenchMonth, frenchWeekday } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useCraGrid, useSaveMonth } from '../hooks';
import {
  ABSENCE_ROW_KEY,
  addRow,
  clearRow,
  entriesFromMatrix,
  fillEmptyWorkdays,
  initMatrix,
  isDayComplete,
  isRowEmpty,
  removeRow,
  withValue,
  type MatrixState,
} from '../matrix';
import { missingDaysFrom } from '../missing-days';
import type { CraGridResponse, GridDay } from '../types';

import { CopyPreviousMonthDialog } from './copy-previous-month-dialog';
import { CraLegend, CraMatrixTable, type MatrixRowMeta } from './cra-matrix-table';
import type { CellQuantity } from './cra-quantity-cell';
import { CraTimeline } from './cra-timeline';

/**
 * Tailwind's `md:` breakpoint (768px, unmodified default), read here to decide — at click time,
 * not at render — whether "Aller au premier jour incomplet" should move the desktop week index or
 * the mobile one. Mirrors the `md:hidden` / `hidden md:block` pair below rather than a new value.
 */
const DESKTOP_BREAKPOINT_QUERY = '(min-width: 768px)';

/**
 * `/releve/:id` — the printable Cra (SSR, `apps/api/src/web/paths.ts`'s `PATHS.craPrint`), not
 * imported: `apps/web` may only import `@erp/contracts` across the API boundary (§2), so this is a
 * literal copy of the one segment that matters, same as `labels.ts`/`format.ts` are copies rather
 * than shared imports (Annexe C.8).
 */
const CRA_PRINT_PATH = '/releve';

function GridSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 6 }, (_unused, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

interface CraGridScreenProps {
  readonly period: string;
  readonly role: Role;
}

/**
 * `/cra/$period` — task 6.2-6.5's flagship matrix (ADR-0070). Data-fetch, loading/error/denied
 * branching, then hands off to the editable body. `role` is only needed for `DeniedState`'s "who
 * was refused" line; the grid's own read is always the caller's own month
 * (`forRoles('consultant')`, no consultant id on the path), so the only 403 this route can produce
 * is `insufficient-role`, not `out-of-scope`.
 */
export function CraGridScreen({ period, role }: CraGridScreenProps): ReactElement {
  const gridQuery = useCraGrid(period);

  if (gridQuery.isPending) return <GridSkeleton />;

  if (gridQuery.isError) {
    const error = gridQuery.error;
    if (error instanceof ApiProblemError) {
      const action = classifyProblem(error.problem);
      if (action.kind === 'denied') {
        return <DeniedState deniedBy={action.deniedBy} role={role} />;
      }

      return (
        <ErrorState
          title={headingFor(error.problem)}
          body={sentenceFor(error.problem)}
          onRetry={() => void gridQuery.refetch()}
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
        onRetry={() => void gridQuery.refetch()}
      />
    );
  }

  return <CraGridBody period={period} data={gridQuery.data} />;
}

function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map((part) => Number.parseInt(part, 10));
  const y = year ?? 0;
  const m = month ?? 1;

  return m === 1 ? `${String(y - 1)}-12` : `${String(y)}-${String(m - 1).padStart(2, '0')}`;
}

function nextPeriod(period: string): string {
  const [year, month] = period.split('-').map((part) => Number.parseInt(part, 10));
  const y = year ?? 0;
  const m = month ?? 1;

  return m === 12 ? `${String(y + 1)}-01` : `${String(y)}-${String(m + 1).padStart(2, '0')}`;
}

interface CraGridBodyProps {
  readonly period: string;
  readonly data: CraGridResponse;
}

function calendarWeeks(days: readonly GridDay[]): readonly (readonly GridDay[])[] {
  const weeks: GridDay[][] = [];
  for (const day of days) {
    if (weeks.length === 0 || frenchWeekday(day.date) === 'lundi') weeks.push([]);
    weeks.at(-1)?.push(day);
  }
  return weeks;
}

function CraGridBody({ period, data }: CraGridBodyProps): ReactElement {
  const [matrix, setMatrix] = useState<MatrixState>(() => initMatrix(data));
  const [dirty, setDirty] = useState(false);
  const [mobileWeekIndex, setMobileWeekIndex] = useState(0);
  // A9's desktop month/week toggle — reuses A11's own slicing (`calendarWeeks`, `WeekNavigator`,
  // `compact`), so this is a second, independent index rather than a new mechanism.
  const [desktopView, setDesktopView] = useState<'month' | 'week'>('month');
  const [desktopWeekIndex, setDesktopWeekIndex] = useState(0);
  const [lastWrite, setLastWrite] = useState<{
    readonly kind: 'saved' | 'submitted';
    readonly at: string;
  } | null>(null);
  // O7: single-level undo for "remplir/vider la ligne" — the matrix as it stood just before that
  // one action, plus a label naming it for the button's own accessible name. Cleared once used, or
  // whenever a fresh `data` resyncs the whole matrix below.
  const [undo, setUndo] = useState<{ readonly matrix: MatrixState; readonly label: string } | null>(
    null,
  );
  // O6: "Copier le mois précédent" — a preview dialog, not a direct mutation.
  const [copyingPreviousMonth, setCopyingPreviousMonth] = useState(false);
  // React's own documented pattern for "reset state when a prop changes" (react.dev, "Adjusting
  // state when a prop changes"): compared and reassigned during render, not inside an effect —
  // `react-hooks/set-state-in-effect` is why this is not a `useEffect`. ADR-0067: the grid's
  // in-memory edit is rebuilt from the server's own answer whenever `data` changes reference — a
  // fresh fetch for a new period, or the refetch a successful save triggers.
  const [syncedWith, setSyncedWith] = useState(data);
  if (data !== syncedWith) {
    setSyncedWith(data);
    setMatrix(initMatrix(data));
    setDirty(false);
    setMobileWeekIndex(0);
    setDesktopWeekIndex(0);
    setUndo(null);
    setCopyingPreviousMonth(false);
  }

  const saveMonth = useSaveMonth(period);

  // task 6.3's own instruction: "une modification non enregistrée bloque la navigation par une
  // confirmation" — `window.confirm` inside `shouldBlockFn` is a synchronous yes/no, which is
  // exactly the contract that sentence asks for; a custom dialog would need its own
  // proceed/cancel plumbing (`withResolver`) for no behavioural difference here.
  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;

      // The one deliberate native dialog in this SPA (comment above explains why); every other
      // confirmation in this codebase uses `components/ui/alert-dialog.tsx` instead.
      return !window.confirm(LABELS.cra.matrix.unsavedChangesConfirm);
    },
    enableBeforeUnload: true,
    disabled: !dirty,
  });

  const flaggedDays = useMemo(() => new Set(data.flags.map((flag) => flag.day)), [data.flags]);
  const workableDays = useMemo(
    () => data.days.filter((day) => day.nonWorkable === null).map((day) => day.date),
    [data.days],
  );
  const missionById = useMemo(
    () => new Map(data.missions.map((mission) => [mission.missionId, mission])),
    [data.missions],
  );

  // `rowOrder` places every mission row contiguously from index 0, Absence always last
  // (`matrix.ts`'s own invariant), so a mission row's position in the array already is its tone
  // index — no counter to reassign across the `.map` callback.
  const rows: MatrixRowMeta[] = useMemo(() => {
    return matrix.rowOrder.map((key, index) => {
      if (key === ABSENCE_ROW_KEY) {
        return { key, label: LABELS.cra.absence, toneIndex: null, assignableDays: null };
      }
      const mission = missionById.get(key);

      return {
        key,
        label: mission?.name ?? key,
        toneIndex: index,
        assignableDays: new Set(mission?.assignableDays ?? []),
      };
    });
  }, [matrix.rowOrder, missionById]);

  const rowsByKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);
  const availableToAdd = data.missions.filter(
    (mission) => !matrix.rowOrder.includes(mission.missionId),
  );

  function updateCell(rowKey: string, day: string, value: CellQuantity): void {
    setMatrix((previous) => withValue(previous, rowKey, day, value));
    setDirty(true);
  }

  function handleFillRow(rowKey: string): void {
    const row = rowsByKey.get(rowKey);
    setUndo({ matrix, label: `${LABELS.cra.matrix.fillEmptyWorkdays} — ${row?.label ?? rowKey}` });
    setMatrix((previous) =>
      fillEmptyWorkdays(previous, rowKey, workableDays, row?.assignableDays ?? null),
    );
    setDirty(true);
  }

  function handleClearRow(rowKey: string): void {
    const row = rowsByKey.get(rowKey);
    setUndo({ matrix, label: `${LABELS.cra.matrix.clearRow} — ${row?.label ?? rowKey}` });
    setMatrix((previous) => clearRow(previous, rowKey));
    setDirty(true);
  }

  function handleUndo(): void {
    if (undo === null) return;
    setMatrix(undo.matrix);
    setUndo(null);
    setDirty(true);
  }

  function handleRemoveRow(rowKey: string): void {
    setMatrix((previous) => removeRow(previous, rowKey));
    setDirty(true);
  }

  function handleAddActivity(missionId: string): void {
    setMatrix((previous) => addRow(previous, missionId));
    setDirty(true);
  }

  async function handleSubmitMonth(submit: boolean): Promise<void> {
    const entries = entriesFromMatrix(matrix);

    try {
      await saveMonth.mutateAsync({ submit, entries });
      setDirty(false);
      const now = new Date();
      setLastWrite({
        kind: submit ? 'submitted' : 'saved',
        at: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      });
    } catch {
      // The refusal renders inline below, from `saveMonth.error` — nothing else to do here.
    }
  }

  const mutationProblem =
    saveMonth.error instanceof ApiProblemError ? saveMonth.error.problem : null;
  // Front-end plan §6.5: an `IncompleteCraError` names the days in the totals row, where the user
  // reads them. `missingDaysFrom` yields an empty set for every other refusal, so the grid carries
  // server-side flags only for the one that produced them.
  const missingDays = missingDaysFrom(mutationProblem);
  const weeks = calendarWeeks(data.days);
  const mobileDays = weeks[mobileWeekIndex] ?? weeks[0] ?? [];
  const desktopDays = weeks[desktopWeekIndex] ?? weeks[0] ?? [];

  // A9's progress bar: a workable day counts once it holds exactly one full day, across every row
  // (`isDayComplete`, `matrix.ts`) — the same bound the totals row's own amber/red tones mirror.
  // `workableGridDays` (the `GridDay`s), not `workableDays` above (the day-string list
  // `fillEmptyWorkdays` wants) — same filter, different shape, kept distinct rather than reusing
  // one and re-deriving the other.
  const workableGridDays = data.days.filter((day) => day.nonWorkable === null);
  const completeWorkableDayCount = workableGridDays.filter((day) =>
    isDayComplete(matrix, day.date),
  ).length;

  // A9's "Aller au premier jour incomplet": focuses the earliest day the server named, whichever
  // of the three simultaneously-mounted matrices (mobile week, desktop month, desktop week) is
  // currently visible — `offsetParent` is null on the CSS-hidden ones (`md:hidden` /
  // `hidden md:block`), so it doubles as the visibility check without reading either breakpoint's
  // own media query twice.
  function goToFirstIncompleteDay(): void {
    const target = [...missingDays].sort().at(0);
    if (target === undefined) return;

    const onDesktop = window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches;
    const weekIndex = weeks.findIndex((week) => week.some((day) => day.date === target));
    if (onDesktop && desktopView === 'week' && weekIndex >= 0) setDesktopWeekIndex(weekIndex);
    else if (!onDesktop && weekIndex >= 0) setMobileWeekIndex(weekIndex);

    // Two frames: one lets the index update above re-render the matrix (if it changed), the next
    // runs after that layout has settled — a single frame can still race the DOM update on a slow
    // render.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const candidates = document.querySelectorAll<HTMLElement>(`[data-cra-day="${target}"]`);
        const visible = [...candidates].find((element) => element.offsetParent !== null);
        visible?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        visible?.focus();
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <MonthNav period={period} />

      <StatusBanner data={data} />

      <CraTimeline timeline={data.timeline} />

      {workableGridDays.length > 0 && (
        <CraProgress completed={completeWorkableDayCount} total={workableGridDays.length} />
      )}

      {data.editable && (
        <div className="flex flex-wrap items-center gap-2">
          {availableToAdd.length > 0 ? (
            <AddActivityControl missions={availableToAdd} onAdd={handleAddActivity} />
          ) : (
            data.missions.length > 0 && (
              <p className="text-sm text-muted-foreground">{LABELS.cra.matrix.noActivityToAdd}</p>
            )
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCopyingPreviousMonth(true);
            }}
          >
            <CopyIcon aria-hidden="true" />
            {LABELS.cra.matrix.copyPreviousMonth}
          </Button>
          {/* O7: single-level undo for the row tools' own fill/clear — `undo.label` names which
              row and which of the two actions, so the button reads as a sentence, not a bare
              "Annuler" nobody can place. */}
          {undo !== null && (
            <Button type="button" variant="ghost" size="sm" onClick={handleUndo}>
              <Undo2Icon aria-hidden="true" />
              {LABELS.cra.matrix.undo} — {undo.label}
            </Button>
          )}
        </div>
      )}

      <CraLegend />

      <div className="md:hidden">
        <WeekNavigator
          days={mobileDays}
          index={mobileWeekIndex}
          count={weeks.length}
          onChange={setMobileWeekIndex}
        />
        <div className="mt-2">
          <CraMatrixTable
            period={period}
            days={mobileDays}
            rows={rows}
            matrix={matrix}
            editable={data.editable}
            compact
            totalLabel={LABELS.cra.weekTotal}
            cellIdPrefix="mobile"
            flaggedDays={flaggedDays}
            missingDays={missingDays}
            onChangeCell={data.editable ? updateCell : undefined}
          />
        </div>
      </div>

      <div className="hidden flex-col gap-2 md:flex">
        {/* `TogglePillGroup`, not `Tabs`: Radix's `TabsTrigger` always emits `aria-controls`
            pointing at the id of a `TabsContent` panel, and this switcher has none — it changes
            the day range of the one table below it rather than swapping two panels. The attribute
            therefore referenced an element that never existed, which axe reports as a *critical*
            `aria-valid-attr-value` (the kitchen sink's own `Tabs`, which does render panels,
            resolves both triggers — verified — so the fault was this call site, not the vendored
            component). The exclusive pill group is the control this app already uses for
            "exactly one of these", with its own accessibility rationale written down. */}
        <TogglePillGroup
          label={LABELS.cra.matrix.viewLabel}
          options={[
            { value: 'month', label: LABELS.cra.matrix.viewMonth },
            { value: 'week', label: LABELS.cra.matrix.viewWeek },
          ]}
          selected={[desktopView]}
          exclusive
          onChange={([value]) => {
            if (value === 'month' || value === 'week') setDesktopView(value);
          }}
        />

        {desktopView === 'week' && (
          <WeekNavigator
            days={desktopDays}
            index={desktopWeekIndex}
            count={weeks.length}
            onChange={setDesktopWeekIndex}
          />
        )}

        <CraMatrixTable
          period={period}
          days={desktopView === 'week' ? desktopDays : data.days}
          rows={rows}
          matrix={matrix}
          editable={data.editable}
          compact={desktopView === 'week'}
          totalLabel={desktopView === 'week' ? LABELS.cra.weekTotal : LABELS.cra.monthTotal}
          cellIdPrefix={desktopView === 'week' ? 'desktop-week' : 'month'}
          flaggedDays={flaggedDays}
          missingDays={missingDays}
          onChangeCell={data.editable ? updateCell : undefined}
          renderRowTools={
            // Fill/clear/remove act on the whole month (`handleFillRow` reads `workableDays`,
            // `clearRow`/`removeRow` wipe the row month-wide) — offered only on the month view, so
            // a "Total semaine" the user is looking at never moves by more than the row action's
            // own visible effect implies.
            data.editable && desktopView === 'month'
              ? (row) => (
                  <RowTools
                    row={row}
                    empty={isRowEmpty(
                      matrix,
                      row.key,
                      data.days.map((day) => day.date),
                    )}
                    onFill={() => {
                      handleFillRow(row.key);
                    }}
                    onClear={() => {
                      handleClearRow(row.key);
                    }}
                    onRemove={() => {
                      handleRemoveRow(row.key);
                    }}
                  />
                )
              : undefined
          }
        />
      </div>

      {copyingPreviousMonth && (
        <CopyPreviousMonthDialog
          sourcePeriod={previousPeriod(period)}
          missions={data.missions}
          workableDays={workableDays}
          matrix={matrix}
          onCancel={() => {
            setCopyingPreviousMonth(false);
          }}
          onConfirm={(nextMatrix) => {
            setUndo({ matrix, label: LABELS.cra.matrix.copyPreviousMonth });
            setMatrix(nextMatrix);
            setDirty(true);
            setCopyingPreviousMonth(false);
          }}
        />
      )}

      {mutationProblem !== null && (
        <Alert variant="destructive">
          <AlertTitle>{headingFor(mutationProblem)}</AlertTitle>
          <AlertDescription>
            {sentenceFor(mutationProblem)}
            {missingDays.size > 0 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="mt-1 block h-auto p-0 text-left text-destructive underline"
                onClick={goToFirstIncompleteDay}
              >
                {LABELS.cra.matrix.goToFirstIncompleteDay}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {data.editable && (
        <div className="sticky bottom-0 z-20 -mx-3 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 p-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button
            className="flex-1 md:flex-none"
            variant="outline"
            disabled={saveMonth.isPending}
            onClick={() => {
              void handleSubmitMonth(false);
            }}
          >
            {LABELS.cra.save}
          </Button>
          <Button
            className="flex-1 md:flex-none"
            disabled={saveMonth.isPending}
            onClick={() => {
              void handleSubmitMonth(true);
            }}
          >
            {LABELS.cra.submit}
          </Button>
          <p
            className={
              saveMonth.isError
                ? 'w-full text-sm text-destructive md:ml-2 md:w-auto'
                : 'w-full text-sm text-muted-foreground md:ml-2 md:w-auto'
            }
            aria-live="polite"
          >
            {saveMonth.isPending
              ? LABELS.cra.saveState.saving
              : saveMonth.isError
                ? LABELS.cra.saveState.failed
                : dirty
                  ? LABELS.cra.saveState.dirty
                  : lastWrite === null
                    ? LABELS.cra.saveState.unchanged
                    : LABELS.cra.saveState[lastWrite.kind].replace('{time}', lastWrite.at)}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A9's progress bar — "X/Y jours ouvrés complets", counted over `data.days` (the whole month), not
 * whichever slice is currently on screen: the mobile week view and the desktop week toggle both
 * show a fragment, and the reader needs the month's own state regardless of which fragment they're
 * looking at. No `Math.round` on the fill width (this codebase reserves rounding for money,
 * `isoWeekNumber`'s own comment above explains the convention) — a CSS percentage tolerates a
 * fractional value fine, so the exact fraction is passed through untouched.
 */
function CraProgress({
  completed,
  total,
}: {
  readonly completed: number;
  readonly total: number;
}): ReactElement {
  const label = LABELS.cra.matrix.workdaysComplete
    .replace('{completed}', String(completed))
    .replace('{total}', String(total));

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="h-1.5 w-full max-w-64 shrink-0 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${String((completed / total) * 100)}%` }}
        />
      </div>
      <p className="text-xs text-nowrap text-muted-foreground">{label}</p>
    </div>
  );
}

function WeekNavigator({
  days,
  index,
  count,
  onChange,
}: {
  readonly days: readonly GridDay[];
  readonly index: number;
  readonly count: number;
  readonly onChange: (index: number) => void;
}): ReactElement {
  const first = days[0]?.date;
  const last = days.at(-1)?.date;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={index === 0}
        aria-label={LABELS.cra.matrix.previousWeek}
        onClick={() => {
          onChange(index - 1);
        }}
      >
        ‹
      </Button>
      <p className="text-center text-sm font-medium">
        {LABELS.cra.matrix.weekPosition
          .replace('{current}', String(index + 1))
          .replace('{count}', String(count))}
        {first !== undefined && last !== undefined && (
          <span className="block text-xs font-normal text-muted-foreground">
            {frenchDate(first)} — {frenchDate(last)}
          </span>
        )}
      </p>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={index >= count - 1}
        aria-label={LABELS.cra.matrix.nextWeek}
        onClick={() => {
          onChange(index + 1);
        }}
      >
        ›
      </Button>
    </div>
  );
}

function MonthNav({ period }: { readonly period: string }): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon-sm" aria-label={LABELS.cra.matrix.previousMonth}>
        <Link to="/cra/$period" params={{ period: previousPeriod(period) }}>
          ‹
        </Link>
      </Button>
      <span className="text-card-title min-w-40 text-center">{frenchMonth(period)}</span>
      <Button asChild variant="outline" size="icon-sm" aria-label={LABELS.cra.matrix.nextMonth}>
        <Link to="/cra/$period" params={{ period: nextPeriod(period) }}>
          ›
        </Link>
      </Button>
      <span className="ml-1 text-sm text-muted-foreground">
        <GlossaryTerm term="cra" />
      </span>
    </div>
  );
}

/**
 * A9: a real, visible tooltip on hover/focus (`components/ui/tooltip.tsx`, Radix) — not the
 * `title` attribute ADR-0061 rejected (invisible on touch, unreliable focus/timing) and not
 * `aria-label` alone, which carries the accessible name but shows nothing to a sighted pointer or
 * keyboard user. Both are kept: `aria-label` names the button, `TooltipContent` shows the same
 * words on hover/focus.
 */
function RowToolButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RowTools({
  row,
  empty,
  onFill,
  onClear,
  onRemove,
}: {
  readonly row: MatrixRowMeta;
  readonly empty: boolean;
  readonly onFill: () => void;
  readonly onClear: () => void;
  readonly onRemove: () => void;
}): ReactElement {
  return (
    <>
      <RowToolButton
        label={`${LABELS.cra.matrix.fillEmptyWorkdays} — ${row.label}`}
        onClick={onFill}
      >
        <ListChecksIcon />
      </RowToolButton>
      <RowToolButton label={`${LABELS.cra.matrix.clearRow} — ${row.label}`} onClick={onClear}>
        <EraserIcon />
      </RowToolButton>
      {row.key !== ABSENCE_ROW_KEY && empty && (
        <RowToolButton label={`${LABELS.cra.matrix.removeRow} — ${row.label}`} onClick={onRemove}>
          <Trash2Icon />
        </RowToolButton>
      )}
    </>
  );
}

function AddActivityControl({
  missions,
  onAdd,
}: {
  readonly missions: CraGridResponse['missions'];
  readonly onAdd: (missionId: string) => void;
}): ReactElement {
  return (
    // Remounted on every addition (`key`): the picker is a one-shot action, not a persisted
    // selection — once a mission is added it leaves `missions` (the caller's `availableToAdd`),
    // and a `Select` holding a value no longer in its own list is exactly the state this avoids
    // having to reason about.
    <Select key={missions.length} onValueChange={onAdd}>
      <SelectTrigger className="w-64" aria-label={LABELS.cra.matrix.addActivity}>
        <PlusIcon className="size-4" />
        <SelectValue placeholder={LABELS.cra.matrix.addActivityPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {missions.map((mission) => (
          <SelectItem key={mission.missionId} value={mission.missionId}>
            {mission.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusBanner({ data }: { readonly data: CraGridResponse }): ReactElement | null {
  if (data.status === null) {
    return (
      <Alert>
        <AlertDescription>{LABELS.cra.notStartedYet}</AlertDescription>
      </Alert>
    );
  }

  if (data.status === 'refused') {
    return (
      <Alert variant="destructive">
        <AlertTitle>{LABELS.cra.statuses.refused}</AlertTitle>
        <AlertDescription>
          {LABELS.cra.refused}
          {data.refusal !== null && (
            <p className="mt-1 font-medium">
              {LABELS.cra.refusalReasonPrefix}
              {data.refusal.reason}
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (data.status === 'submitted') {
    return (
      <Alert>
        <AlertDescription>{LABELS.cra.readOnly.submitted}</AlertDescription>
      </Alert>
    );
  }

  if (data.status === 'validated') {
    return (
      <Alert>
        <AlertDescription>
          {LABELS.cra.readOnly.validated}
          {data.validatedBy !== null && (
            <> {LABELS.cra.validatedByLabel.replace('{name}', data.validatedBy)}</>
          )}
          {data.craId !== null && (
            <>
              {' '}
              <a
                href={`${CRA_PRINT_PATH}/${data.craId}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                {LABELS.craPrint.open}
              </a>
            </>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
