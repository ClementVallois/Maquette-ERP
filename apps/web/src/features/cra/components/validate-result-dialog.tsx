import type { ReactElement } from 'react';

import { StatusBadge, type StatusBadgeVariant } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { InvoiceListItem } from '@/features/factures/types';
import { frenchDays, frenchEuros } from '@/lib/format';
import { LABELS } from '@/lib/labels';

import type { DeclinedDay, ValidationResponse } from '../types';

const INVOICE_STATUS_VARIANT: Record<InvoiceListItem['status'], StatusBadgeVariant> = {
  draft: 'invoice-draft',
  issued: 'invoice-issued',
  cancelledByCreditNote: 'invoice-cancelled',
};

const DECLINE_REASON_VARIANT: Record<DeclinedDay['reason'], StatusBadgeVariant> = {
  notRegie: 'declined-not-regie',
  unknownMission: 'declined-unknown-mission',
  noAgreedRate: 'declined-no-agreed-rate',
  unknownClient: 'declined-unknown-client',
};

interface ValidateResultDialogProps {
  // Deliberately narrow rather than a full pré-facturier row: this dialog only ever reads the
  // consultant's name for its title. The CRA detail screen (item 3, QA round 1) has a Cra but not
  // a pré-facturier row, and does not need to fabricate the rest to open this dialog.
  readonly cra: { readonly consultantName: string };
  readonly result: ValidationResponse;
  readonly onClose: () => void;
}

/**
 * Task 7.2's result dialog. Purely presentational — the caller already ran the mutation and is the
 * one that decided which toast to show (success vs. `replayed`); this component only ever renders
 * a result it was handed, success or replay alike, which is what "résultat d'origine affiché" means
 * on a replay.
 *
 * Lives under `features/cra/`, not `features/pre-facturier/` where it was first written — same
 * reasoning as this file's sibling `refuse-dialog.tsx`, whose header explains the direction.
 */
export function ValidateResultDialog({
  cra,
  result,
  onClose,
}: ValidateResultDialogProps): ReactElement {
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
            {LABELS.preFacturier.validateDialog.title.replace('{name}', cra.consultantName)}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <section className="flex flex-col gap-2">
            <h3 className="text-label">{LABELS.preFacturier.validateDialog.invoicesHeading}</h3>
            {result.invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {LABELS.preFacturier.validateDialog.noInvoices}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {result.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2"
                  >
                    <span className="font-medium text-foreground">{invoice.billedToName}</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge variant={INVOICE_STATUS_VARIANT[invoice.status]} />
                      <span className="tabular-nums text-muted-foreground">
                        {invoice.totalTtcCents === null
                          ? LABELS.preFacturier.notNumberedYet
                          : frenchEuros(invoice.totalTtcCents)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-label">{LABELS.preFacturier.validateDialog.declinedHeading}</h3>
            {result.declined.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {LABELS.preFacturier.validateDialog.noDeclined}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {result.declined.map((declined, index) => (
                  <li
                    // A declined day carries no id of its own on the wire — `craId` is this same
                    // Cra for every entry here, so the pair that actually varies is
                    // `(missionId, reason)`, combined with the index for the rare case a mission
                    // declines twice for the same reason across different quarter-day groupings.
                    key={`${declined.missionId}-${declined.reason}-${String(index)}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2"
                  >
                    <span className="font-mono text-[0.8125rem] text-muted-foreground">
                      {LABELS.preFacturier.validateDialog.declinedQuantity
                        .replace('{days}', frenchDays(declined.quarterDays))
                        .replace('{mission}', declined.missionId)}
                    </span>
                    <StatusBadge variant={DECLINE_REASON_VARIANT[declined.reason]} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            {LABELS.preFacturier.validateDialog.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
