import type { ReactElement } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiProblemError } from '@/lib/api-client';
import { LABELS } from '@/lib/labels';
import { sentenceFor } from '@/lib/problems';

import { useRefuseCra } from '../hooks';

const REASON_MAX_LENGTH = 500;

interface RefuseDialogProps {
  readonly period: string;
  // Deliberately narrow rather than a full pré-facturier row: this dialog only ever reads these
  // two fields (the title, and the id it posts against), so either caller — the pré-facturier
  // table's own row, or the CRA detail screen (item 3, QA round 1), which only has a Cra, not a
  // pré-facturier row — can hand it exactly what it has.
  readonly cra: { readonly craId: string; readonly consultantName: string };
  readonly onClose: () => void;
  /**
   * Called once, right before `onClose`, only on a successful refusal — never on cancel. Optional:
   * the pré-facturier table has nowhere more sensible to go than staying put, so it leaves this
   * unset; the CRA detail screen (item 3, QA round 1) uses it to route the manager back to the
   * pré-facturier once there is nothing left to decide on this row.
   */
  readonly onRefused?: () => void;
}

/**
 * Task 7.3 — `POST /api/v1/cras/:id/refusal`, `reason` mandatory (the domain's own bound is 1-500
 * chars; `RefusalReasonRequiredError` also refuses a whitespace-only string, which `trim()` below
 * mirrors so the submit button does not invite a request the domain will reject anyway). Unlike
 * validation, this is a genuine two-step dialog: nothing is sent until the manager confirms a
 * reason.
 *
 * Lives under `features/cra/`, not `features/pre-facturier/` where it was first written: the
 * mutation it drives (`useRefuseCra`) is a Cra action wired against `features/cra/api.ts`, and
 * `features/pre-facturier` already imports from `features/cra` for its own row/status types — the
 * one direction this SPA's features use between each other (mirrored exactly by
 * `features/factures/types.ts`'s own header, which explains why `InvoiceListItem` lives there and
 * not in `features/cra`). The CRA detail screen (item 3, QA round 1) needed this same dialog from
 * inside `features/cra`; moving it here keeps that one direction rather than adding the reverse
 * arrow a caller under `features/cra` importing from `features/pre-facturier` would have opened.
 */
export function RefuseDialog({ period, cra, onClose, onRefused }: RefuseDialogProps): ReactElement {
  const [reason, setReason] = useState('');
  const refuseMutation = useRefuseCra(period);
  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && reason.length <= REASON_MAX_LENGTH;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;

    try {
      await refuseMutation.mutateAsync({ craId: cra.craId, reason });
      toast.success(LABELS.preFacturier.refuseSuccessToast);
      onRefused?.();
      onClose();
    } catch {
      // The refusal renders inline below, from `refuseMutation.error` — nothing else to do here.
    }
  }

  const mutationProblem =
    refuseMutation.error instanceof ApiProblemError ? refuseMutation.error.problem : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <div>
          <DialogHeader>
            <DialogTitle>
              {LABELS.preFacturier.refuseDialog.title.replace('{name}', cra.consultantName)}
            </DialogTitle>
            <DialogDescription>{LABELS.preFacturier.refuseDialog.lead}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 py-1">
            <Label htmlFor="refuse-reason">{LABELS.preFacturier.refuseDialog.reasonLabel}</Label>
            <Textarea
              id="refuse-reason"
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              aria-invalid={mutationProblem !== null}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              autoFocus
            />
            {mutationProblem !== null && (
              <p className="text-sm text-destructive">{sentenceFor(mutationProblem)}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {LABELS.preFacturier.refuseDialog.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canSubmit}
              pending={refuseMutation.isPending}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {LABELS.preFacturier.refuseDialog.confirm}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
