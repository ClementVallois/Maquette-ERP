import { Link, useBlocker } from '@tanstack/react-router';
import { EraserIcon, ListChecksIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
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
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchMonth } from '@/lib/format';
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
  isRowEmpty,
  removeRow,
  withValue,
  type MatrixState,
} from '../matrix';
import { missingDaysFrom } from '../missing-days';
import type { CraGridResponse } from '../types';

import { CraMatrixTable, type MatrixRowMeta } from './cra-matrix-table';
import type { CellQuantity } from './cra-quantity-cell';
import { CraTimeline } from './cra-timeline';

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

function CraGridBody({ period, data }: CraGridBodyProps): ReactElement {
  const [matrix, setMatrix] = useState<MatrixState>(() => initMatrix(data));
  const [dirty, setDirty] = useState(false);
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
    setMatrix((previous) =>
      fillEmptyWorkdays(previous, rowKey, workableDays, row?.assignableDays ?? null),
    );
    setDirty(true);
  }

  function handleClearRow(rowKey: string): void {
    setMatrix((previous) => clearRow(previous, rowKey));
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
      toast.success(submit ? LABELS.cra.submittedToast : LABELS.cra.savedToast);
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

  return (
    <div className="flex flex-col gap-4">
      <MonthNav period={period} />

      <StatusBanner data={data} />

      <CraTimeline timeline={data.timeline} />

      {data.editable && (
        <div className="flex items-center gap-2">
          {availableToAdd.length > 0 ? (
            <AddActivityControl missions={availableToAdd} onAdd={handleAddActivity} />
          ) : (
            data.missions.length > 0 && (
              <p className="text-sm text-muted-foreground">{LABELS.cra.matrix.noActivityToAdd}</p>
            )
          )}
        </div>
      )}

      <CraMatrixTable
        period={period}
        days={data.days}
        rows={rows}
        matrix={matrix}
        editable={data.editable}
        flaggedDays={flaggedDays}
        missingDays={missingDays}
        onChangeCell={data.editable ? updateCell : undefined}
        renderRowTools={
          data.editable
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

function MonthNav({ period }: { readonly period: string }): ReactElement {
  return (
    <div className="flex items-center gap-2">
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
    </div>
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
      {/* No `title` (ADR-0061: not exposed on touch, not focusable, not announced consistently)
          — `aria-label` alone already carries the same words, disambiguated by row. */}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${LABELS.cra.matrix.fillEmptyWorkdays} — ${row.label}`}
        onClick={onFill}
      >
        <ListChecksIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`${LABELS.cra.matrix.clearRow} — ${row.label}`}
        onClick={onClear}
      >
        <EraserIcon />
      </Button>
      {row.key !== ABSENCE_ROW_KEY && empty && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${LABELS.cra.matrix.removeRow} — ${row.label}`}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
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
