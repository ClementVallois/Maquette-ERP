import { ChevronLeftIcon, ChevronRightIcon, ListChecksIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { frenchDate } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

import { addRow, fillEmptyWorkdays, type MatrixState } from '../matrix';
import type { GridDay } from '../types';

import type { MatrixRowMeta } from './cra-matrix-table';

export function CraProgress({
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
        // No `shrink-0`: at 375px the bar's own 256px `max-w-64` plus the `text-nowrap` label
        // beside it came to 424px inside a 351px page. The bar is the half that can give ground.
        className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-muted"
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

export function MobileWeekFill({
  rows,
  days,
  matrix,
  onFill,
}: {
  readonly rows: readonly Pick<MatrixRowMeta, 'key' | 'label' | 'assignableDays'>[];
  readonly days: readonly GridDay[];
  readonly matrix: MatrixState;
  readonly onFill: (matrix: MatrixState, label: string) => void;
}): ReactElement {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const workableDays = days.filter((day) => day.nonWorkable === null).map((day) => day.date);
  const options = rows.map((row) => {
    const nextMatrix = fillEmptyWorkdays(
      addRow(matrix, row.key),
      row.key,
      workableDays,
      row.assignableDays,
    );
    return { row, nextMatrix, count: nextMatrix.cells.size - matrix.cells.size };
  });
  const selected =
    options.find(({ row }) => row.key === selectedKey) ??
    options.find(({ count }) => count > 0) ??
    options[0];
  const count = selected?.count ?? 0;

  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
      <label htmlFor="mobile-fill-activity" className="text-sm font-medium">
        {LABELS.cra.matrix.fillWeekActivity}
      </label>
      <select
        id="mobile-fill-activity"
        className="mt-2 h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={selected?.row.key ?? ''}
        onChange={(event) => {
          setSelectedKey(event.target.value);
        }}
        aria-describedby="mobile-fill-hint mobile-fill-count"
      >
        {options.map(({ row }) => (
          <option key={row.key} value={row.key}>
            {row.label}
          </option>
        ))}
      </select>
      <p id="mobile-fill-hint" className="mt-2 text-xs text-muted-foreground">
        {LABELS.cra.matrix.fillWeekHint}
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 min-h-11 w-full"
        disabled={count === 0}
        onClick={() => {
          if (selected !== undefined && selected.count > 0) {
            setSelectedKey(selected.row.key);
            onFill(selected.nextMatrix, selected.row.label);
          }
        }}
      >
        <ListChecksIcon aria-hidden="true" />
        {LABELS.cra.matrix.fillWeek}
      </Button>
      <p id="mobile-fill-count" role="status" className="mt-2 text-xs text-muted-foreground">
        {count === 0
          ? LABELS.cra.matrix.fillWeekEmpty
          : count === 1
            ? LABELS.cra.matrix.fillWeekCountOne
            : LABELS.cra.matrix.fillWeekCountMany.replace('{count}', String(count))}
      </p>
    </div>
  );
}

/**
 * `compact` is the phone's own action-bar form: touch-sized outline buttons and `3/5` where the
 * desktop reads "Semaine 3 sur 5". The long sentence stays the accessible name in both, so the
 * shortening never reaches a screen reader.
 */
export function WeekNavigator({
  days,
  index,
  count,
  onChange,
  compact = false,
}: {
  readonly days: readonly GridDay[];
  readonly index: number;
  readonly count: number;
  readonly onChange: (index: number) => void;
  readonly compact?: boolean;
}): ReactElement {
  const first = days[0]?.date;
  const last = days.at(-1)?.date;
  const position = LABELS.cra.matrix.weekPosition
    .replace('{current}', String(index + 1))
    .replace('{count}', String(count));

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        compact ? 'rounded-lg' : 'rounded-lg bg-muted p-2',
      )}
    >
      <Button
        type="button"
        size={compact ? 'icon' : 'icon-sm'}
        variant={compact ? 'outline' : 'ghost'}
        className={compact ? 'size-11' : undefined}
        disabled={index === 0}
        aria-label={LABELS.cra.matrix.previousWeek}
        onClick={() => {
          onChange(index - 1);
        }}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <p className="min-w-0 text-center text-sm font-medium">
        {compact ? (
          <>
            <span className="sr-only">{position}</span>
            <span aria-hidden="true">
              {LABELS.cra.matrix.weekPositionShort
                .replace('{current}', String(index + 1))
                .replace('{count}', String(count))}
            </span>
          </>
        ) : (
          position
        )}
        {first !== undefined && last !== undefined && (
          <span className="block text-xs font-normal text-muted-foreground">
            {frenchDate(first)} — {frenchDate(last)}
          </span>
        )}
      </p>
      <Button
        type="button"
        size={compact ? 'icon' : 'icon-sm'}
        variant={compact ? 'outline' : 'ghost'}
        className={compact ? 'size-11' : undefined}
        disabled={index >= count - 1}
        aria-label={LABELS.cra.matrix.nextWeek}
        onClick={() => {
          onChange(index + 1);
        }}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * O7's single-level undo. The visible text names the action alone; the row it applied to is
 * appended to the accessible name, which keeps the visible half a substring of it (WCAG 2.5.3).
 */
