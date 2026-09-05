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
import { ApiProblemError } from '@/lib/api-client';
import { frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { sentenceFor } from '@/lib/problems';

import { useIssueInvoice } from '../hooks';
import type { InvoiceDetail } from '../types';

interface IssuanceDialogProps {
  readonly invoice: InvoiceDetail;
  readonly onClose: () => void;
}

/**
 * Task 8.3 — billing only (the caller, `invoice-detail-screen.tsx`, never renders the button that
 * opens this for any other role). The `Idempotency-Key` is generated once, when the dialog opens
 * (`useState`'s initializer, not an effect — the same key must survive a retry of the *same*
 * confirmation, which a `crypto.randomUUID()` called again on every render would not give), 8-200
 * characters respected by construction (a UUID is 36). Success shows the allocated `SEC-2026-…`
 * number; `replayed: true` is still success (ADR-0021: 200, never 409) and gets the informational
 * toast task 8.3 asks for, never the ordinary success one.
 */
export function IssuanceDialog({ invoice, onClose }: IssuanceDialogProps): ReactElement {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [issued, setIssued] = useState<{
    readonly number: string;
    readonly replayed: boolean;
  } | null>(null);
  const issueMutation = useIssueInvoice();

  async function handleConfirm(): Promise<void> {
    try {
      const result = await issueMutation.mutateAsync({ invoiceId: invoice.id, idempotencyKey });
      setIssued({ number: result.invoiceNumber, replayed: result.replayed });
      if (result.replayed) {
        toast.info(LABELS.invoice.issueReplayedToast);
      } else {
        toast.success(LABELS.invoice.issueSuccessToast.replace('{number}', result.invoiceNumber));
      }
    } catch {
      // Rendered inline below, from `issueMutation.error` — the 409 invoice-transition-not-allowed
      // case (task 8.3: "rendu comme état, pas comme crash") renders exactly like any other
      // refusal here, never a second, special-cased branch.
    }
  }

  const mutationProblem =
    issueMutation.error instanceof ApiProblemError ? issueMutation.error.problem : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {LABELS.invoice.issueDialog.title.replace('{name}', invoice.billedTo.name)}
          </DialogTitle>
          {issued === null && <DialogDescription>{LABELS.invoice.issueNote}</DialogDescription>}
        </DialogHeader>

        {issued === null ? (
          <div className="flex flex-col gap-2 py-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{LABELS.invoice.client}</span>
              <span className="text-foreground">{invoice.billedTo.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{LABELS.invoice.supplyPeriod}</span>
              <span className="text-foreground">{frenchMonth(invoice.supplyPeriod)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{LABELS.invoice.lines}</span>
              <span className="text-foreground">{invoice.lines.length}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{LABELS.invoice.totalExcludingVat}</span>
              <span className="text-foreground">
                {frenchEuros(invoice.totals.totalExcludingVatCents)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{LABELS.invoice.totalVat}</span>
              <span className="text-foreground">{frenchEuros(invoice.totals.vatTotalCents)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{LABELS.invoice.totalIncludingVat}</span>
              <span className="font-medium text-foreground">
                {frenchEuros(invoice.totals.totalIncludingVatCents)}
              </span>
            </div>
            {mutationProblem !== null && (
              <p className="text-sm text-destructive">{sentenceFor(mutationProblem)}</p>
            )}
          </div>
        ) : (
          <p className="py-1 text-sm text-foreground">
            <span className="font-mono font-medium">{issued.number}</span>
          </p>
        )}

        <DialogFooter>
          {issued === null ? (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                {LABELS.invoice.issueDialog.cancel}
              </Button>
              <Button
                type="button"
                pending={issueMutation.isPending}
                onClick={() => {
                  void handleConfirm();
                }}
              >
                {LABELS.invoice.issueDialog.confirm}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onClose}>
              {LABELS.action.close}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
