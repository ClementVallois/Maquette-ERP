import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useManagerCraGrid } from '../hooks';
import { ABSENCE_ROW_KEY, initMatrix } from '../matrix';
import type { ManagerCraGridResponse } from '../types';

import { CraMatrixTable, type MatrixRowMeta } from './cra-matrix-table';

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

interface ManagerCraGridScreenProps {
  readonly consultantId: string;
  readonly period: string;
  readonly role: Role;
}

/**
 * `/cra/$period/$consultantId` (ADR-0071) — a manager's read-only view of a named consultant's
 * month. Renders through the same `CraMatrixTable` the consultant's own editable grid uses, with
 * editing forced off regardless of the payload's own `editable` field (ADR-0071's own decision: a
 * manager never edits a consultant's CRA — BUILD-RULES, separation of duties) and none of the row
 * tools, add-activity control or save/submit buttons the editable screen offers.
 *
 * The 403 this route can produce is `out-of-scope` — a manager of another office — unlike the
 * consultant route's own `insufficient-role`; `DeniedState` renders either the same way, from
 * `deniedBy`.
 */
export function ManagerCraGridScreen({
  consultantId,
  period,
  role,
}: ManagerCraGridScreenProps): ReactElement {
  const gridQuery = useManagerCraGrid(consultantId, period);

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

  return <ManagerCraGridBody period={period} data={gridQuery.data} />;
}

function ManagerCraGridBody({
  period,
  data,
}: {
  readonly period: string;
  readonly data: ManagerCraGridResponse;
}): ReactElement {
  const matrix = useMemo(() => initMatrix(data), [data]);
  const flaggedDays = useMemo(() => new Set(data.flags.map((flag) => flag.day)), [data.flags]);
  const missionById = useMemo(
    () => new Map(data.missions.map((mission) => [mission.missionId, mission])),
    [data.missions],
  );

  // Same invariant `cra-grid-screen.tsx` relies on: `rowOrder` places every mission row
  // contiguously from index 0, Absence last, so the array position is already the tone index.
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

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link to="/cra">
          <ArrowLeftIcon />
          {LABELS.cra.managerView.backToList}
        </Link>
      </Button>

      <Alert>
        <AlertDescription>
          {LABELS.cra.managerView.banner.replace('{name}', data.consultantName)}
        </AlertDescription>
      </Alert>

      {data.status === 'validated' && data.validatedBy !== null && (
        <Alert>
          <AlertDescription>
            {LABELS.cra.validatedByLabel.replace('{name}', data.validatedBy)}
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
      )}

      {data.status === 'refused' && data.refusal !== null && (
        <Alert variant="destructive">
          <AlertDescription>{data.refusal.reason}</AlertDescription>
        </Alert>
      )}

      {data.craId === null && (
        <Alert>
          <AlertDescription>{LABELS.cra.notStartedYet}</AlertDescription>
        </Alert>
      )}

      <CraMatrixTable
        period={period}
        days={data.days}
        rows={rows}
        matrix={matrix}
        editable={false}
        flaggedDays={flaggedDays}
      />
    </div>
  );
}
