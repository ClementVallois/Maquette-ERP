import type { ReactElement } from 'react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDays, frenchMonth, frenchWeekday } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';
import { cn } from '@/lib/utils';

import { useCraGrid, useSaveMonth } from '../hooks';
import {
  entriesFor,
  MORNING,
  slotsFor,
  SLOT_QUARTER_DAYS,
  type DaySlots,
  type SlotValue,
} from '../slots';
import type { CraGridResponse, GridDay } from '../types';

import { CraSlotControl, labelForSlot, type NavigationDirection } from './cra-slot-control';

/**
 * `/releve/:id` — the printable Cra (SSR, `apps/api/src/web/paths.ts`'s `PATHS.craPrint`), not
 * imported: `apps/web` may only import `@erp/contracts` across the API boundary (§2), so this is a
 * literal copy of the one segment that matters, same as `labels.ts`/`format.ts` are copies rather
 * than shared imports (Annexe C.8).
 */
const CRA_PRINT_PATH = '/releve';

const EMPTY_DAY: DaySlots = [{ kind: 'empty' }, { kind: 'empty' }];

function initLocal(data: CraGridResponse): Map<string, DaySlots> {
  const map = new Map<string, DaySlots>();
  for (const day of data.days) map.set(day.date, slotsFor(data.lines, day.date));

  return map;
}

interface Totals {
  readonly perMission: readonly { readonly missionId: string; readonly quarterDays: number }[];
  readonly absenceQuarterDays: number;
  readonly totalQuarterDays: number;
}

/**
 * Counts filled slots, then converts to quarter-days at the edge (`* SLOT_QUARTER_DAYS`): the
 * counting itself stays slot-shaped, which is this legacy screen's own local state, and only the
 * value handed to `frenchDays` needs to be in the storage unit (ADR-0069).
 */
function computeTotals(local: ReadonlyMap<string, DaySlots>): Totals {
  const perMission = new Map<string, number>();
  let absenceSlots = 0;
  let totalSlots = 0;

  for (const slots of local.values()) {
    for (const slot of slots) {
      if (slot.kind === 'empty') continue;
      totalSlots += 1;
      if (slot.kind === 'absence') {
        absenceSlots += 1;
      } else {
        perMission.set(slot.missionId, (perMission.get(slot.missionId) ?? 0) + 1);
      }
    }
  }

  return {
    perMission: [...perMission.entries()].map(([missionId, slots]) => ({
      missionId,
      quarterDays: slots * SLOT_QUARTER_DAYS,
    })),
    absenceQuarterDays: absenceSlots * SLOT_QUARTER_DAYS,
    totalQuarterDays: totalSlots * SLOT_QUARTER_DAYS,
  };
}

function GridSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 10 }, (_unused, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function dayLabel(date: string): string {
  return `${frenchWeekday(date)} ${date.slice(8, 10)}`;
}

interface CraGridScreenProps {
  readonly period: string;
  readonly role: Role;
}

/**
 * `/cra/$period` — task 6.2-6.5's flagship grid. Data-fetch, loading/error/denied branching, then
 * hands off to the editable body. `role` is only needed for `DeniedState`'s "who was refused"
 * line; the grid's own read is always the caller's own month (`forRoles('consultant')`, no
 * consultant id on the path), so the only 403 this route can produce is `insufficient-role`, not
 * `out-of-scope` (`docs/open-questions.md`, row dated 25/08/2026).
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

  return <CraGridBody period={period} data={gridQuery.data} />;
}

interface CraGridBodyProps {
  readonly period: string;
  readonly data: CraGridResponse;
}

function CraGridBody({ period, data }: CraGridBodyProps): ReactElement {
  const [local, setLocal] = useState<Map<string, DaySlots>>(() => initLocal(data));
  // React's own documented pattern for "reset state when a prop changes" (react.dev, "Adjusting
  // state when a prop changes"): compared and reassigned during render, not inside an effect —
  // `react-hooks/set-state-in-effect` is why this is not a `useEffect`. ADR-0067: the grid's
  // in-memory edit is rebuilt from the server's own answer whenever `data` changes reference — a
  // fresh fetch for a new period, or the refetch a successful save triggers.
  const [syncedWith, setSyncedWith] = useState(data);
  if (data !== syncedWith) {
    setSyncedWith(data);
    setLocal(initLocal(data));
  }

  const saveMonth = useSaveMonth(period);
  const refs = useRef(new Map<string, HTMLSelectElement>());

  const flaggedDays = useMemo(() => new Set(data.flags.map((flag) => flag.day)), [data.flags]);
  const totals = useMemo(() => computeTotals(local), [local]);

  function updateSlot(day: string, slotIndex: 0 | 1, value: SlotValue): void {
    setLocal((previous) => {
      const next = new Map(previous);
      const existing = next.get(day) ?? EMPTY_DAY;
      const updated: DaySlots = slotIndex === MORNING ? [value, existing[1]] : [existing[0], value];
      next.set(day, updated);

      return next;
    });
  }

  function refKey(day: string, slotIndex: 0 | 1): string {
    return `${day}:${String(slotIndex)}`;
  }

  function moveFocus(day: string, slotIndex: 0 | 1, direction: NavigationDirection): void {
    const dates = data.days.map((candidate) => candidate.date);
    const dayIndex = dates.indexOf(day);
    let targetDay = day;
    let targetSlot = slotIndex;

    if (direction === 'up') targetDay = dates[dayIndex - 1] ?? day;
    else if (direction === 'down') targetDay = dates[dayIndex + 1] ?? day;
    else if (direction === 'left') targetSlot = MORNING;
    else targetSlot = 1;

    refs.current.get(refKey(targetDay, targetSlot))?.focus();
  }

  async function handleSubmitMonth(submit: boolean): Promise<void> {
    const days = data.days.map((day) => ({
      day: day.date,
      slots: local.get(day.date) ?? EMPTY_DAY,
    }));
    const entries = entriesFor(days);

    try {
      await saveMonth.mutateAsync({ submit, entries });
      toast.success(submit ? LABELS.cra.submittedToast : LABELS.cra.savedToast);
    } catch {
      // The refusal renders inline below, from `saveMonth.error` — nothing else to do here.
    }
  }

  const mutationProblem =
    saveMonth.error instanceof ApiProblemError ? saveMonth.error.problem : null;

  return (
    <div className="flex flex-col gap-4">
      <StatusBanner data={data} />

      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{LABELS.cra.day}</TableHead>
              <TableHead>{LABELS.cra.morning}</TableHead>
              <TableHead>{LABELS.cra.afternoon}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.days.map((day) => (
              <DayRow
                key={day.date}
                day={day}
                slots={local.get(day.date) ?? EMPTY_DAY}
                flagged={flaggedDays.has(day.date)}
                missions={data.missions}
                editable={data.editable}
                onChangeSlot={(slotIndex, value) => {
                  updateSlot(day.date, slotIndex, value);
                }}
                onNavigate={(slotIndex, direction) => {
                  moveFocus(day.date, slotIndex, direction);
                }}
                registerRef={(slotIndex, element) => {
                  const key = refKey(day.date, slotIndex);
                  if (element) refs.current.set(key, element);
                  else refs.current.delete(key);
                }}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <TotalsPanel totals={totals} data={data} editable={data.editable} />

      {mutationProblem !== null && (
        <Alert variant="destructive">
          <AlertTitle>{headingFor(mutationProblem)}</AlertTitle>
          <AlertDescription>{sentenceFor(mutationProblem)}</AlertDescription>
        </Alert>
      )}

      {data.editable && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={saveMonth.isPending}
            onClick={() => {
              void handleSubmitMonth(false);
            }}
          >
            {LABELS.cra.save}
          </Button>
          <Button
            disabled={saveMonth.isPending}
            onClick={() => {
              void handleSubmitMonth(true);
            }}
          >
            {LABELS.cra.submit}
          </Button>
        </div>
      )}
    </div>
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
          {data.refusal !== null && <p className="mt-1 font-medium">{data.refusal.reason}</p>}
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

interface DayRowProps {
  readonly day: GridDay;
  readonly slots: DaySlots;
  readonly flagged: boolean;
  readonly missions: CraGridResponse['missions'];
  readonly editable: boolean;
  readonly onChangeSlot: (slotIndex: 0 | 1, value: SlotValue) => void;
  readonly onNavigate: (slotIndex: 0 | 1, direction: NavigationDirection) => void;
  readonly registerRef: (slotIndex: 0 | 1, element: HTMLSelectElement | null) => void;
}

function DayRow({
  day,
  slots,
  flagged,
  missions,
  editable,
  onChangeSlot,
  onNavigate,
  registerRef,
}: DayRowProps): ReactElement {
  const tintClass =
    day.nonWorkable === 'weekend'
      ? 'bg-flag-weekend-bg'
      : day.nonWorkable === 'publicHoliday'
        ? 'bg-flag-holiday-bg'
        : undefined;

  return (
    <TableRow className={tintClass}>
      <th scope="row" className="px-4 py-3 text-left align-middle whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'font-medium',
              day.nonWorkable !== null && 'font-normal text-muted-foreground',
            )}
          >
            {dayLabel(day.date)}
          </span>
          {day.nonWorkable !== null && (
            <span
              className={cn(
                'text-[0.71875rem]',
                day.nonWorkable === 'publicHoliday'
                  ? 'text-flag-holiday-text'
                  : 'text-flag-weekend-text',
              )}
            >
              {LABELS.cra.nonWorkable[day.nonWorkable]}
            </span>
          )}
          {flagged && (
            <span className="rounded-full bg-status-late-fill px-1.5 py-0.5 text-[0.71875rem] text-status-late-text">
              {LABELS.cra.flagged}
            </span>
          )}
        </div>
      </th>
      {([0, 1] as const).map((slotIndex) => (
        <TableCell key={slotIndex}>
          <CraSlotControl
            day={day.date}
            slotIndex={slotIndex}
            value={slots[slotIndex]}
            missions={missions}
            editable={editable}
            onChange={(value) => {
              onChangeSlot(slotIndex, value);
            }}
            onNavigate={(direction) => {
              onNavigate(slotIndex, direction);
            }}
            registerRef={(element) => {
              registerRef(slotIndex, element);
            }}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

interface TotalsPanelProps {
  readonly totals: Totals;
  readonly data: CraGridResponse;
  readonly editable: boolean;
}

function TotalsPanel({ totals, data, editable }: TotalsPanelProps): ReactElement {
  const hasAnything = totals.totalQuarterDays > 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-card ring-1 ring-border">
      <div className="flex items-baseline justify-between">
        <h2 className="text-card-title">{LABELS.cra.totals}</h2>
        {editable && <span className="text-help">{LABELS.cra.totalsLive}</span>}
      </div>

      {!hasAnything ? (
        <p className="text-sm text-muted-foreground">{LABELS.cra.nothingRecorded}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{LABELS.cra.mission}</TableHead>
              <TableHead>{LABELS.cra.quantity}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.perMission.map((row) => (
              <TableRow key={row.missionId}>
                <TableCell>
                  {labelForSlot({ kind: 'mission', missionId: row.missionId }, data.missions)}
                </TableCell>
                <TableCell className="tabular-nums">{frenchDays(row.quarterDays)}</TableCell>
              </TableRow>
            ))}
            {totals.absenceQuarterDays > 0 && (
              <TableRow>
                <TableCell>{LABELS.cra.absence}</TableCell>
                <TableCell className="tabular-nums">
                  {frenchDays(totals.absenceQuarterDays)}
                </TableCell>
              </TableRow>
            )}
            <TableRow className="font-medium hover:bg-transparent">
              <TableCell>{frenchMonth(data.period)}</TableCell>
              <TableCell className="tabular-nums">{frenchDays(totals.totalQuarterDays)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
