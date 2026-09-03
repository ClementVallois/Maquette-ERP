import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';

import { craGridQueryOptions } from '../hooks';
import { addRow, fillEmptyWorkdays, type MatrixState } from '../matrix';
import type { GridMission } from '../types';

interface CopyPlanEntry {
  readonly missionId: string;
  readonly missionName: string;
  readonly daysToFill: number;
}

interface CopyPlan {
  readonly entries: readonly CopyPlanEntry[];
  /** The matrix `onConfirm` receives verbatim — built by applying `fillEmptyWorkdays` mission by
   * mission, in the same order the preview lists them, so two missions that would both want the
   * same day never double-book it: the second one's `fillEmptyWorkdays` sees the first one's cell
   * already there and skips it, same as the row tool's own guarantee. */
  readonly matrix: MatrixState;
}

/**
 * O6's "never overwrite an existing cell": built entirely from `fillEmptyWorkdays` — the same
 * function the row tools use — never a second fill rule invented for this dialog. A mission is
 * offered only if it actually had recorded worked time last month; a mission this month's grid
 * does not know at all (no longer staffed) is silently skipped, same as `fillEmptyWorkdays` would
 * skip every one of its days for having no `assignableDays`.
 */
function planCopyPreviousMonth(
  missions: readonly GridMission[],
  workedMissionIds: ReadonlySet<string>,
  startingMatrix: MatrixState,
  workableDays: readonly string[],
): CopyPlan {
  const entries: CopyPlanEntry[] = [];
  let matrix = startingMatrix;

  for (const mission of missions) {
    if (!workedMissionIds.has(mission.missionId)) continue;

    const before = matrix.cells.size;
    const withRow = addRow(matrix, mission.missionId);
    const filled = fillEmptyWorkdays(
      withRow,
      mission.missionId,
      workableDays,
      new Set(mission.assignableDays),
    );
    const daysToFill = filled.cells.size - before;
    if (daysToFill <= 0) continue;

    entries.push({ missionId: mission.missionId, missionName: mission.name, daysToFill });
    matrix = filled;
  }

  return { entries, matrix };
}

interface CopyPreviousMonthDialogProps {
  readonly sourcePeriod: string;
  readonly missions: readonly GridMission[];
  readonly workableDays: readonly string[];
  readonly matrix: MatrixState;
  readonly onCancel: () => void;
  readonly onConfirm: (nextMatrix: MatrixState) => void;
}

/**
 * O6 — "Copier le mois précédent", with a preview: `sourcePeriod`'s grid is fetched (the same
 * `craGridQueryOptions` the current month itself reads, so this is a plain cache-backed query, not
 * a bespoke fetch), and every mission with recorded worked time there gets offered as a row of
 * "N jours" before anything changes — the confirm button applies exactly what the list shows,
 * nothing more.
 */
export function CopyPreviousMonthDialog({
  sourcePeriod,
  missions,
  workableDays,
  matrix,
  onCancel,
  onConfirm,
}: CopyPreviousMonthDialogProps): ReactElement {
  const query = useQuery(craGridQueryOptions(sourcePeriod));

  const plan = useMemo(() => {
    if (query.data === undefined) return null;

    const workedMissionIds = new Set(
      query.data.lines
        .filter((line) => line.dayType === 'worked' && line.quarterDays > 0)
        .map((line) => line.missionId)
        .filter((id): id is string => id !== null),
    );

    return planCopyPreviousMonth(missions, workedMissionIds, matrix, workableDays);
  }, [query.data, missions, matrix, workableDays]);

  const labels = LABELS.cra.matrix.copyPreviousMonthDialog;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <div>
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
            <DialogDescription>
              {labels.lead.replace('{month}', frenchMonth(sourcePeriod))}
            </DialogDescription>
          </DialogHeader>

          <div className="py-1">
            {query.isPending && (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            )}
            {query.isError && <p className="text-sm text-destructive">{labels.loadError}</p>}
            {plan !== null && plan.entries.length === 0 && (
              <p className="text-sm text-muted-foreground">{labels.empty}</p>
            )}
            {plan !== null && plan.entries.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {plan.entries.map((entry) => (
                  <li key={entry.missionId} className="flex justify-between gap-4">
                    <span className="text-foreground">{entry.missionName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {labels.daysToFill.replace('{days}', String(entry.daysToFill))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {labels.cancel}
            </Button>
            <Button
              type="button"
              disabled={plan === null || plan.entries.length === 0}
              onClick={() => {
                if (plan !== null) onConfirm(plan.matrix);
              }}
            >
              {labels.confirm}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
