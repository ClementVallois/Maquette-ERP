import type { IsoDate } from '@erp/platform';

import {
  assertDocumentAddsUp,
  type DocumentTotals,
  type VatGroup,
  totalsOf,
  vatBreakdownOf,
} from './document.ts';
import { NotAnIssuedInvoiceError } from './errors.ts';
import type { InvoiceLine } from './invoice-line.ts';
import type { BilledParty, Invoice } from './invoice.ts';
import type { LegalMentions } from './mentions.ts';
import { documentNumber, type SeriesKey, seriesKeyOf } from './numbering.ts';
import type { LegalEntity } from './seller.ts';

/**
 * Why an issued invoice is being corrected. Typed, because "why" is the field an audit reads and
 * a free-text reason is a field nobody can group, count or answer a question with.
 */
export const CREDIT_NOTE_REASONS = [
  'entryError',
  'commercialGesture',
  'scopeDispute',
  'cancellation',
] as const;

export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

/**
 * The only correction of an issued `Invoice`, since an issued invoice is never modified.
 *
 * It carries **positive** amounts and the fact that it is a credit note is what reverses them
 * (ADR-0036), and it takes its number from the **same series** as the invoice (ADR-0018). It has
 * no lifecycle: it is issued in one act and never changes, which is why it is a value and not an
 * aggregate.
 */
export interface CreditNote {
  readonly id: string;
  readonly number: string;
  readonly series: SeriesKey;
  readonly issueDate: IsoDate;
  readonly reason: CreditNoteReason;
  readonly cancels: { readonly invoiceId: string; readonly invoiceNumber: string };
  readonly seller: LegalEntity;
  readonly billedTo: BilledParty;
  readonly supplyPeriod: string;
  readonly lines: readonly InvoiceLine[];
  readonly vatBreakdown: readonly VatGroup[];
  readonly totals: DocumentTotals;
  readonly mentions: LegalMentions;
}

/**
 * Reverses an invoice **in full** and marks it cancelled. A partial credit note is not built here
 * — the README says so, and ADR-0036 leans on it: a partial reversal is arithmetically
 * indistinguishable from a discount, which this mockup deliberately does not model.
 */
export function creditNote(input: {
  id: string;
  invoice: Invoice;
  reason: CreditNoteReason;
  sequence: number;
  issueDate: IsoDate;
}): CreditNote {
  const { invoice } = input;
  const invoiceNumber = invoice.number;

  if (invoice.status !== 'issued' || invoiceNumber === null) {
    throw new NotAnIssuedInvoiceError(invoice.id, invoice.status);
  }

  const lines = invoice.lines;
  const series = seriesKeyOf(invoice.seller, input.issueDate);
  const note: CreditNote = {
    id: input.id,
    number: documentNumber(invoice.seller, series, input.sequence),
    series,
    issueDate: input.issueDate,
    reason: input.reason,
    cancels: { invoiceId: invoice.id, invoiceNumber },
    seller: invoice.seller,
    billedTo: invoice.billedTo,
    supplyPeriod: invoice.supplyPeriod,
    lines,
    vatBreakdown: vatBreakdownOf(lines),
    totals: totalsOf(lines),
    mentions: invoice.mentions,
  };

  assertDocumentAddsUp(note);
  // Last, and only once the note is fully built: a refusal above must leave the invoice issued.
  invoice.cancelByCreditNote();

  return note;
}
