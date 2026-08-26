import { describe, expect, it } from 'vitest';

import { creditNote } from './credit-note.ts';
import { assertDocumentAddsUp } from './document.ts';
import { DocumentDoesNotAddUpError, NotAnIssuedInvoiceError } from './errors.ts';
import { type InvoiceLine, regieLine } from './invoice-line.ts';
import { billedParty, Invoice } from './invoice.ts';
import {
  MARCH,
  MENTIONS,
  parisClient,
  REGIE_MISSION,
  SELLER,
  TERMS,
} from './testing/march-2026.ts';
import type { VatTreatment } from './vat.ts';

const STANDARD: VatTreatment = { kind: 'taxable', basisPoints: 2000 };

function lineOf(tjmCents = 65_000, vat: VatTreatment = STANDARD): InvoiceLine {
  return regieLine({
    designation: 'Prestation d’audit — mars 2026',
    missionId: REGIE_MISSION,
    craId: 'cra-1',
    period: '2026-03',
    quarterDays: 4,
    tjmCents,
    vat,
  });
}

function issuedInvoice(lines: readonly InvoiceLine[] = [lineOf()]): Invoice {
  const invoice = Invoice.draft({
    id: 'invoice-1',
    officeId: 'office-paris',
    seller: SELLER,
    billedTo: billedParty(parisClient),
    supplyPeriod: MARCH,
    lines,
    terms: TERMS,
    mentions: MENTIONS,
    validatedBy: ['bruno'],
  });
  invoice.issue({ by: 'claire', sequence: 12, issueDate: '2026-04-02' });

  return invoice;
}

describe('a credit note', () => {
  it('reverses an issued invoice in full, and cancels it', () => {
    const invoice = issuedInvoice();
    const note = creditNote({
      id: 'note-1',
      invoice,
      reason: 'entryError',
      sequence: 13,
      issueDate: '2026-04-10',
    });

    expect(note.cancels).toStrictEqual({
      invoiceId: 'invoice-1',
      invoiceNumber: 'SEC-2026-000012',
    });
    expect(note.totals).toStrictEqual(invoice.totals);
    expect(invoice.status).toBe('cancelledByCreditNote');
  });

  it('carries positive amounts, and lets its type carry the direction', () => {
    // ADR-0036. A credit note of 780,00 € reduces what the client owes by 780,00 €, and the
    // reduction is read from the kind of document it is — not from a minus sign inside it.
    const note = creditNote({
      id: 'note-1',
      invoice: issuedInvoice(),
      reason: 'cancellation',
      sequence: 13,
      issueDate: '2026-04-10',
    });

    expect(note.totals.totalIncludingVatCents).toBe(78_000);
    expect(note.lines.every((line) => line.amountCents > 0)).toBe(true);
  });

  it('takes its number from the same series as the invoice it corrects', () => {
    // One counter, so the two documents are in one chronological order (ADR-0018), and the number
    // says nothing about which kind it is.
    const note = creditNote({
      id: 'note-1',
      invoice: issuedInvoice(),
      reason: 'scopeDispute',
      sequence: 13,
      issueDate: '2026-04-10',
    });

    expect(note.number).toBe('SEC-2026-000013');
    expect(note.series).toStrictEqual({ entityId: 'entity-fr', fiscalYear: 2026 });
  });

  it('says why, in a value an audit can group rather than in free text', () => {
    const note = creditNote({
      id: 'note-1',
      invoice: issuedInvoice(),
      reason: 'commercialGesture',
      sequence: 13,
      issueDate: '2026-04-10',
    });

    expect(note.reason).toBe('commercialGesture');
  });

  it('refuses to correct anything but an issued invoice', () => {
    const draft = Invoice.draft({
      id: 'invoice-2',
      officeId: 'office-paris',
      seller: SELLER,
      billedTo: billedParty(parisClient),
      supplyPeriod: MARCH,
      lines: [lineOf()],
      terms: TERMS,
      mentions: MENTIONS,
      validatedBy: ['bruno'],
    });

    expect(() =>
      creditNote({
        id: 'note-1',
        invoice: draft,
        reason: 'entryError',
        sequence: 1,
        issueDate: '2026-04-10',
      }),
    ).toThrow(NotAnIssuedInvoiceError);
    expect(draft.status).toBe('draft');
  });

  it('leaves the invoice issued when its own number is refused', () => {
    // The order inside the factory, asserted: the invoice is cancelled last, so a refusal does not
    // leave an invoice marked as corrected by a credit note that was never produced.
    const invoice = issuedInvoice();

    expect(() =>
      creditNote({
        id: 'note-1',
        invoice,
        reason: 'entryError',
        sequence: 0,
        issueDate: '2026-04-10',
      }),
    ).toThrow();
    expect(invoice.status).toBe('issued');
  });

  it('refuses to correct an invoice a credit note has already cancelled', () => {
    const invoice = issuedInvoice();
    creditNote({
      id: 'note-1',
      invoice,
      reason: 'entryError',
      sequence: 13,
      issueDate: '2026-04-10',
    });

    expect(() =>
      creditNote({
        id: 'note-2',
        invoice,
        reason: 'entryError',
        sequence: 14,
        issueDate: '2026-04-11',
      }),
    ).toThrow(NotAnIssuedInvoiceError);
  });
});

describe('the check a document passes before it leaves', () => {
  it('accepts a document whose totals agree with its lines', () => {
    const invoice = issuedInvoice([
      lineOf(),
      lineOf(58_000, { kind: 'taxable', basisPoints: 850 }),
    ]);

    expect(() => {
      assertDocumentAddsUp({
        id: invoice.id,
        lines: invoice.lines,
        vatBreakdown: invoice.vatBreakdown,
        totals: invoice.totals,
      });
    }).not.toThrow();
  });

  it('accepts a document whose only group carries no VAT amount at all', () => {
    // The group with `vatCents: null`. A check that read it as zero would agree by accident here
    // and disagree on a mixed document, which is the case that would ship wrong.
    const invoice = issuedInvoice([
      lineOf(65_000, { kind: 'notCharged', reason: 'reverseChargeEuB2b' }),
    ]);

    expect(invoice.totals.vatTotalCents).toBe(0);
    expect(() => {
      assertDocumentAddsUp({
        id: invoice.id,
        lines: invoice.lines,
        vatBreakdown: invoice.vatBreakdown,
        totals: invoice.totals,
      });
    }).not.toThrow();
  });

  it('refuses a total excluding VAT that its lines do not sum to', () => {
    // The shape Phase 3 creates: totals are columns, lines are another table, and the two can
    // disagree. Here the disagreement is written by hand, which is the only way to reach it today.
    const invoice = issuedInvoice();

    expect(() => {
      assertDocumentAddsUp({
        id: invoice.id,
        lines: invoice.lines,
        vatBreakdown: invoice.vatBreakdown,
        totals: { ...invoice.totals, totalExcludingVatCents: 65_001 },
      });
    }).toThrow(DocumentDoesNotAddUpError);
  });

  it('refuses a VAT total that the recapitulative does not sum to', () => {
    const invoice = issuedInvoice();

    expect(() => {
      assertDocumentAddsUp({
        id: invoice.id,
        lines: invoice.lines,
        vatBreakdown: invoice.vatBreakdown,
        totals: { ...invoice.totals, vatTotalCents: 12_999 },
      });
    }).toThrow(DocumentDoesNotAddUpError);
  });

  it('refuses a total including VAT that is not the two others added together', () => {
    const invoice = issuedInvoice();

    expect(() => {
      assertDocumentAddsUp({
        id: invoice.id,
        lines: invoice.lines,
        vatBreakdown: invoice.vatBreakdown,
        totals: { ...invoice.totals, totalIncludingVatCents: 77_999 },
      });
    }).toThrow(DocumentDoesNotAddUpError);
  });

  it('refuses a line that reached the page without reaching the recapitulative', () => {
    const invoice = issuedInvoice();

    expect(() => {
      assertDocumentAddsUp({
        id: invoice.id,
        lines: [...invoice.lines, lineOf()],
        vatBreakdown: invoice.vatBreakdown,
        totals: { ...invoice.totals, totalExcludingVatCents: 130_000 },
      });
    }).toThrow(DocumentDoesNotAddUpError);
  });
});
