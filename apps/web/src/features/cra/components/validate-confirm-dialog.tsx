import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LABELS } from '@/lib/labels';

export interface ValidateConfirmFact {
  readonly label: string;
  readonly value: string;
}

interface ValidateConfirmDialogProps {
  readonly consultantName: string;
  /** What this screen already knows about the month, shown as a plain recap `<dl>` — deliberately
   * a caller-built list rather than a fixed schema: `manager-cra-grid-screen.tsx` has the clients
   * with recorded work on hand, the pré-facturier's own row does not, and neither one invents a
   * fact it would have to recompute the domain's own eligibility rules to get right. */
  readonly facts: readonly ValidateConfirmFact[];
  readonly pending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * O4 — "Valider" used to act the instant it was clicked. `RefuseDialog`'s own two-step shape
 * (recap, then a confirm button) is the template: unlike a refusal, there is no free-text field
 * here, only a moment to read what is about to happen before it becomes irreversible
 * (ADR-0038/ADR-0052: validation is immediate and drafts one invoice per client).
 */
export function ValidateConfirmDialog({
  consultantName,
  facts,
  pending,
  onConfirm,
  onCancel,
}: ValidateConfirmDialogProps): ReactElement {
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
            <DialogTitle>
              {LABELS.preFacturier.validateConfirmDialog.title.replace('{name}', consultantName)}
            </DialogTitle>
            <DialogDescription>{LABELS.preFacturier.validateConfirmDialog.lead}</DialogDescription>
          </DialogHeader>

          {facts.length > 0 && (
            <dl className="flex flex-col gap-1 py-1 text-sm">
              {facts.map((fact) => (
                <div key={fact.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="text-right font-medium text-foreground">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {LABELS.preFacturier.validateConfirmDialog.cancel}
            </Button>
            <Button type="button" disabled={pending} onClick={onConfirm}>
              {LABELS.preFacturier.validateConfirmDialog.confirm}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
