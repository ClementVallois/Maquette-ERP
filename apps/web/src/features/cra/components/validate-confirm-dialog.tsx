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
  /** Item 28, QA round 3: a weekend/holiday entry is a fact worth more visual weight than a plain
   * `<dl>` row — this used to be one of `facts` above, indistinguishable from "période" or
   * "clients", and the whole reason for the warning is to make it hard to validate past by
   * accident. Required and nullable, deliberately: a caller must say whether it computed the flag
   * at all, rather than silently inheriting "no warning" through an optional prop. `> 0` is the
   * loud warning; `0` renders nothing, same as before; `null` renders a muted advisory.
   * ADR-0095. */
  readonly flaggedDaysCount: number | null;
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
  flaggedDaysCount,
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

          {/* Item 28, QA round 3: same amber tone the CRA grid's own flagged-day marker uses — a
              warning, never a block, so validation is still one click away below. */}
          {flaggedDaysCount !== null && flaggedDaysCount > 0 && (
            <div className="mt-1 rounded-lg bg-status-late-fill p-2.5 text-sm text-status-late-text ring-1 ring-status-late-dot/30">
              {flaggedDaysCount === 1
                ? LABELS.preFacturier.validateConfirmDialog.flaggedDaysWarningOne
                : LABELS.preFacturier.validateConfirmDialog.flaggedDaysWarningMany.replace(
                    '{count}',
                    String(flaggedDaysCount),
                  )}
            </div>
          )}

          {/* ADR-0095. Plain text and not a link: a navigation link inside an open dialog
              discards the decision state the dialog is holding. */}
          {flaggedDaysCount === null && (
            <p className="mt-1 text-sm text-muted-foreground">
              {LABELS.preFacturier.validateConfirmDialog.flaggedDaysNotComputed}
            </p>
          )}

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
