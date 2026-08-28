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
import type { PreFacturierCraRow } from '../types';

const REASON_MAX_LENGTH = 500;

interface RefuseDialogProps {
  readonly period: string;
  readonly cra: PreFacturierCraRow;
  readonly onClose: () => void;
}

/**
 * Task 7.3 — `POST /api/v1/cras/:id/refusal`, `reason` mandatory (the domain's own bound is 1-500
 * chars; `RefusalReasonRequiredError` also refuses a whitespace-only string, which `trim()` below
 * mirrors so the submit button does not invite a request the domain will reject anyway). Unlike
 * validation, this is a genuine two-step dialog: nothing is sent until the manager confirms a
 * reason.
 */
export function RefuseDialog({ period, cra, onClose }: RefuseDialogProps): ReactElement {
  const [reason, setReason] = useState('');
  const refuseMutation = useRefuseCra(period);
  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && reason.length <= REASON_MAX_LENGTH;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;

    try {
      await refuseMutation.mutateAsync({ craId: cra.craId, reason });
      toast.success(LABELS.preFacturier.refuseSuccessToast);
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
              disabled={!canSubmit || refuseMutation.isPending}
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
