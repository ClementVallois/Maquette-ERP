import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useManagerCraGrid, useValidateCra } from '../hooks';
import { ABSENCE_ROW_KEY, initMatrix } from '../matrix';
import type { ManagerCraGridResponse, ValidationResponse } from '../types';

import { CraMatrixTable, type MatrixRowMeta } from './cra-matrix-table';
import { CraTimeline } from './cra-timeline';
import { RefuseDialog } from './refuse-dialog';
import { ValidateResultDialog } from './validate-result-dialog';

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

  return <ManagerCraGridBody period={period} data={gridQuery.data} role={role} />;
}

function ManagerCraGridBody({
  period,
  data,
  role,
}: {
  readonly period: string;
  readonly data: ManagerCraGridResponse;
  readonly role: Role;
}): ReactElement {
  const navigate = useNavigate();
  const validateMutation = useValidateCra(period);
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
  const [refusing, setRefusing] = useState(false);

  // Mirrors the server's own `decidable` (`composition/pre-facturier.ts`:
  // `mayDecide && status === 'submitted'`, where `mayDecide` is a role capability, not a per-row
  // check) — this route is manager-only (ADR-0071), so reaching this render already proves the
  // role half; only the status half is left to check. Separation of duties (whoever recorded does
  // not validate) is still enforced server-side on the mutation itself, same as the pré-facturier
  // table: a violation surfaces as the mutation's own typed refusal, not a client-side guess.
  const decidable = role === 'manager' && data.status === 'submitted';

  function backToPreFacturier(): void {
    void navigate({ to: '/pre-facturier', search: { period } });
  }

  async function handleValidate(): Promise<void> {
    if (data.craId === null) return;

    try {
      const result = await validateMutation.mutateAsync(data.craId);
      setValidationResult(result);
      if (result.replayed) {
        toast.info(LABELS.preFacturier.validateReplayedToast);
      } else {
        toast.success(LABELS.preFacturier.validateSuccessToast);
      }
    } catch (error) {
      toast.error(
        error instanceof ApiProblemError
          ? sentenceFor(error.problem)
          : LABELS.shell.unexpectedErrorBody,
      );
    }
  }

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

  // `decidable` already implies a Cra exists (the server's own rule requires `status ===
  // 'submitted'`), but the type of `data.craId` does not carry that — narrowed here once so the
  // buttons below and the dialogs they open never have to repeat the null check.
  const craId = data.craId;
  const canDecide = decidable && craId !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link to="/cra">
            <ArrowLeftIcon />
            {LABELS.cra.managerView.backToList}
          </Link>
        </Button>

        {/* Item 3, QA round 1: validate/refuse reachable from here, not only from the
            pré-facturier row that links here — `craColumns`'s own comment in
            `pre-facturier-screen.tsx` explains the other direction. */}
        {canDecide && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={validateMutation.isPending}
              onClick={() => {
                void handleValidate();
              }}
            >
              {LABELS.preFacturier.validate}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRefusing(true);
              }}
            >
              {LABELS.preFacturier.refuse}
            </Button>
          </div>
        )}
      </div>

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

      <CraTimeline timeline={data.timeline} />

      <CraMatrixTable
        period={period}
        days={data.days}
        rows={rows}
        matrix={matrix}
        editable={false}
        flaggedDays={flaggedDays}
      />

      {/* Both dialogs land the manager back on the pré-facturier once there is nothing left to
          decide on this row — item 3's "must land back somewhere sensible after validating". A
          cancelled refusal (`RefuseDialog`'s "Annuler") stays on this screen: only `onRefused`,
          never plain `onClose`, navigates.

          `validationResult` alone gates this one, deliberately not `canDecide` too: the mutation's
          own `onSuccess` (`useValidateCra`) invalidates this exact query, so by the time the result
          is in hand `data.status` has often already flipped away from `'submitted'` — `canDecide`
          would go false right as the dialog is meant to open, which is what item 3's own first
          version of this file got wrong (found by `journeys.spec.ts`'s own regression test timing
          out waiting for a dialog that could never render). */}
      {validationResult !== null && (
        <ValidateResultDialog
          cra={{ consultantName: data.consultantName }}
          result={validationResult}
          onClose={backToPreFacturier}
        />
      )}

      {refusing && canDecide && (
        <RefuseDialog
          period={period}
          cra={{ craId, consultantName: data.consultantName }}
          onClose={() => {
            setRefusing(false);
          }}
          onRefused={backToPreFacturier}
        />
      )}
    </div>
  );
}
