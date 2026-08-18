import { InvalidValueError, period } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import {
  EmptyInvoiceError,
  InvalidPaymentTermError,
  InvalidSequenceError,
  InvoiceTransitionError,
  LineOutsideInvoicePeriodError,
  PaymentTermsTooLongError,
  ValidatorCannotIssueError,
} from './errors.ts';
import { type InvoiceLine, regieLine } from './invoice-line.ts';
import { billedParty, Invoice } from './invoice.ts';
import { legalMentions, RECOVERY_INDEMNITY_CENTS } from './mentions.ts';
import { applyRate } from './money.ts';
import { documentNumber, sameSeries, seriesKeyOf } from './numbering.ts';
import { dueDate, MAX_END_OF_MONTH_DAYS, MAX_NET_DAYS, paymentTerms } from './payment-terms.ts';
import { legalEntity } from './seller.ts';
import {
  MARCH,
  MENTIONS,
  parisClient,
  REGIE_MISSION,
  reunionClient,
  SELLER,
  TERMS,
} from './testing/march-2026.ts';
import type { VatTreatment } from './vat.ts';

const STANDARD: VatTreatment = { kind: 'taxable', basisPoints: 2000 };
const OVERSEAS: VatTreatment = { kind: 'taxable', basisPoints: 850 };
const REVERSE_CHARGE: VatTreatment = { kind: 'notCharged', reason: 'reverseChargeEuB2b' };

function lineOf(amountBase: number, vat: VatTreatment, halfDays = 2): InvoiceLine {
  return regieLine({
    designation: 'Prestation d’audit — mars 2026',
    missionId: REGIE_MISSION,
    craId: 'cra-1',
    period: '2026-03',
    halfDays,
    tjmCents: amountBase,
    vat,
  });
}

function invoiceOf(lines: readonly InvoiceLine[], validatedBy = ['bruno']): Invoice {
  return Invoice.draft({
    id: 'invoice-1',
    officeId: 'office-paris',
    seller: SELLER,
    billedTo: billedParty(parisClient),
    supplyPeriod: MARCH,
    lines,
    terms: TERMS,
    mentions: MENTIONS,
    validatedBy,
  });
}

describe('a draft invoice', () => {
  it('copies the client onto the document rather than pointing at it', () => {
    const { billedTo } = invoiceOf([lineOf(65_000, STANDARD)]);

    expect(billedTo.name).toBe('Banque Nord SA');
    expect(billedTo.siren).toBe('552100554');
    // A mandatory field of the reform. It falls back to the billing address by carrying it, so
    // the document never has a blank where a required line should be.
    expect(billedTo.deliveryAddress).toStrictEqual(parisClient.billingAddress);
  });

  it('opens as a draft, covering the month it was drafted for', () => {
    const invoice = invoiceOf([lineOf(65_000, STANDARD)]);

    expect(invoice.id).toBe('invoice-1');
    expect(invoice.status).toBe('draft');
    expect(invoice.supplyPeriod).toBe('2026-03');
    expect(invoice.terms).toStrictEqual({ kind: 'net', days: 30 });
  });

  it('carries every mandatory mention on the model, not in a template', () => {
    const { mentions, seller } = invoiceOf([lineOf(65_000, STANDARD)]);

    expect(mentions.recoveryIndemnityCents).toBe(RECOVERY_INDEMNITY_CENTS);
    expect(mentions.earlyPaymentDiscount).toStrictEqual({ kind: 'none' });
    expect(mentions.operationCategory).toBe('services');
    expect(mentions.vatOnDebitsOption).toBe(true);
    expect(seller.rcsRegistration).toContain('RCS');
    expect(seller.intraCommunityVatNumber).toBe('FR23493296529');
  });

  it('refuses an invoice with no line', () => {
    expect(() => invoiceOf([])).toThrow(EmptyInvoiceError);
  });

  it('refuses a line worked in another month than the one it covers', () => {
    const february = regieLine({
      designation: 'Prestation d’audit — février 2026',
      missionId: REGIE_MISSION,
      craId: 'cra-0',
      period: '2026-02',
      halfDays: 2,
      tjmCents: 62_000,
      vat: STANDARD,
    });

    expect(() => invoiceOf([february])).toThrow(LineOutsideInvoicePeriodError);
  });

  it('holds who validated the days it bills', () => {
    // Not decoration: it is what lets the second rule of separation of duties be held here
    // without billing importing timesheet (ADR-0006).
    expect(invoiceOf([lineOf(65_000, STANDARD)]).validatedBy).toStrictEqual(['bruno']);
  });

  it('hands out its lines as a copy', () => {
    const invoice = invoiceOf([lineOf(65_000, STANDARD)]);
    const stolen = invoice.lines as InvoiceLine[];
    stolen.push(lineOf(65_000, STANDARD));

    expect(invoice.lines).toHaveLength(1);
  });
});

describe('the VAT recapitulative', () => {
  it('rounds once per rate, on the summed base — not once per line', () => {
    // THE reference test of ADR-0010, chosen because it is one of the cases where the two orders
    // disagree. Two lines of 1 005 cents at 8,5 %: rounded per line, 85 + 85 = 170; rounded once
    // on the summed base, 8,5 % of 2 010 is 170,85 → 171. One cent, and it is the cent accounting
    // reports. A test built on two lines of 1 010 would answer 172 either way and prove nothing.
    const invoice = invoiceOf([
      regieLine({ ...base(), halfDays: 1, tjmCents: 2010, vat: OVERSEAS }),
      regieLine({ ...base(), halfDays: 1, tjmCents: 2010, vat: OVERSEAS }),
    ]);

    expect(invoice.lines.map((line) => line.amountCents)).toStrictEqual([1005, 1005]);
    expect(invoice.vatBreakdown).toHaveLength(1);
    expect(invoice.vatBreakdown[0]?.vatCents).toBe(171);
    expect(applyRate(1005, 850) + applyRate(1005, 850)).toBe(170);
  });

  it('separates two rates into two groups, each rounded once', () => {
    const invoice = invoiceOf([
      lineOf(65_000, STANDARD),
      lineOf(65_000, STANDARD),
      lineOf(58_000, OVERSEAS),
    ]);
    const groups = invoice.vatBreakdown;

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.key === 'taxable:2000')).toMatchObject({
      baseCents: 130_000,
      vatCents: 26_000,
    });
    expect(groups.find((group) => group.key === 'taxable:850')).toMatchObject({
      baseCents: 58_000,
      vatCents: 4930,
    });
  });

  it('gives a group that carries no French VAT no amount at all, and a mention instead', () => {
    // Not a zero: 0 % is a rate and "outside the scope" is not (ADR-0010). A `0` here would sum
    // into the VAT total and read as a taxed operation on the recapitulative.
    const [group] = invoiceOf([lineOf(65_000, REVERSE_CHARGE)]).vatBreakdown;

    expect(group?.vatCents).toBeNull();
    expect(group?.mention).toContain('Autoliquidation');
  });
});

describe('the totals', () => {
  it('are the sum of the lines, plus the VAT of each rate group', () => {
    const invoice = invoiceOf([lineOf(65_000, STANDARD), lineOf(58_000, OVERSEAS)]);

    expect(invoice.totals).toStrictEqual({
      totalExcludingVatCents: 123_000,
      vatTotalCents: 13_000 + 4930,
      totalIncludingVatCents: 123_000 + 13_000 + 4930,
    });
  });

  it('leave a reverse-charged line out of the VAT total but in the base', () => {
    const invoice = invoiceOf([lineOf(65_000, REVERSE_CHARGE)]);

    expect(invoice.totals).toStrictEqual({
      totalExcludingVatCents: 65_000,
      vatTotalCents: 0,
      totalIncludingVatCents: 65_000,
    });
  });
});

describe('payment terms', () => {
  it('compute a net due date by adding the days to the invoice date', () => {
    expect(dueDate({ kind: 'net', days: 30 }, '2026-03-15')).toBe('2026-04-14');
  });

  it('compute an end-of-month due date by adding the days first, then moving to the end', () => {
    // ADR-0017 picks this reading of "45 jours fin de mois" and names the other, which would give
    // 15/05/2026 here. The invoice states which it used, because the law does not choose.
    expect(dueDate({ kind: 'endOfMonth', days: 45 }, '2026-03-15')).toBe('2026-04-30');
  });

  it('are capped at sixty days net and forty-five days end of month', () => {
    expect(paymentTerms({ kind: 'net', days: MAX_NET_DAYS }).days).toBe(60);
    expect(paymentTerms({ kind: 'endOfMonth', days: MAX_END_OF_MONTH_DAYS }).days).toBe(45);
    expect(() => paymentTerms({ kind: 'net', days: 61 })).toThrow(PaymentTermsTooLongError);
    expect(() => paymentTerms({ kind: 'endOfMonth', days: 46 })).toThrow(PaymentTermsTooLongError);
  });

  it('refuse a term that is not a whole number of days, and say that rather than "too long"', () => {
    // −1 is not above the cap, and a refusal that says it is names a reason that is not the
    // reason. The first version of this test asserted the throw and locked the wrong one in.
    expect(() => paymentTerms({ kind: 'net', days: -1 })).toThrow(InvalidPaymentTermError);
    expect(() => paymentTerms({ kind: 'net', days: 1.5 })).toThrow(InvalidPaymentTermError);
    expect(() => paymentTerms({ kind: 'net', days: -1 })).toThrow(/whole number of days/);
  });

  it('read a due date off the invoice that agreed them', () => {
    expect(invoiceOf([lineOf(65_000, STANDARD)]).dueDateFrom('2026-03-31')).toBe('2026-04-30');
  });
});

describe('the mentions a document must carry', () => {
  it('refuse a late-payment rate below the legal floor', () => {
    expect(() => legalMentions({ ...MENTIONS, latePaymentBasisPoints: 500 })).toThrow(
      InvalidValueError,
    );
  });

  it('refuse a recovery indemnity that is not the one fixed by decree', () => {
    expect(() => legalMentions({ ...MENTIONS, recoveryIndemnityCents: 5000 })).toThrow(
      InvalidValueError,
    );
  });

  it('refuse an early-payment discount that is a rate of nothing', () => {
    expect(() =>
      legalMentions({ ...MENTIONS, earlyPaymentDiscount: { kind: 'rate', basisPoints: 0 } }),
    ).toThrow(InvalidValueError);
    expect(
      legalMentions({ ...MENTIONS, earlyPaymentDiscount: { kind: 'rate', basisPoints: 200 } })
        .earlyPaymentDiscount,
    ).toStrictEqual({ kind: 'rate', basisPoints: 200 });
  });

  it('refuse a seller whose SIREN, capital or number prefix does not hold', () => {
    expect(() => legalEntity({ ...SELLER, siren: '493296527' })).toThrow(InvalidValueError);
    expect(() => legalEntity({ ...SELLER, shareCapitalCents: 0 })).toThrow(InvalidValueError);
    expect(() => legalEntity({ ...SELLER, numberPrefix: 'x' })).toThrow(InvalidValueError);
  });
});

function base() {
  return {
    designation: 'Prestation d’audit — mars 2026',
    missionId: REGIE_MISSION,
    craId: 'cra-1',
    period: '2026-03',
    halfDays: 2,
    tjmCents: 65_000,
    vat: STANDARD,
  };
}

it('bills a client of La Réunion at its own rate, end to end', () => {
  const invoice = Invoice.draft({
    id: 'invoice-2',
    officeId: 'office-paris',
    seller: SELLER,
    billedTo: billedParty(reunionClient),
    supplyPeriod: period(2026, 3),
    lines: [regieLine({ ...base(), tjmCents: 58_000, halfDays: 42, vat: OVERSEAS })],
    terms: TERMS,
    mentions: MENTIONS,
    validatedBy: ['bruno'],
  });

  expect(invoice.totals.totalExcludingVatCents).toBe(1_218_000);
  expect(invoice.totals.vatTotalCents).toBe(103_530);
});

describe('issuing an invoice', () => {
  it('gives it a number from the series, a date, and frozen totals', () => {
    const invoice = invoiceOf([lineOf(65_000, STANDARD)]);
    invoice.issue({ by: 'claire', sequence: 42, issueDate: '2026-04-02' });

    expect(invoice.status).toBe('issued');
    expect(invoice.number).toBe('SEC-2026-000042');
    expect(invoice.issueDate).toBe('2026-04-02');
    expect(invoice.series).toStrictEqual({ entityId: 'entity-fr', fiscalYear: 2026 });
    expect(invoice.totals.totalIncludingVatCents).toBe(78_000);
  });

  it('refuses the person who validated the days it bills', () => {
    // The second rule of separation of duties (ADR-0006), and the reason validatedBy travels in
    // the event payload: billing holds a rule about someone else's act without ever asking
    // timesheet who performed it.
    const invoice = invoiceOf([lineOf(65_000, STANDARD)], ['bruno']);

    expect(() => {
      invoice.issue({ by: 'bruno', sequence: 1, issueDate: '2026-04-02' });
    }).toThrow(ValidatorCannotIssueError);
    expect(invoice.status).toBe('draft');
    expect(invoice.number).toBeNull();
  });

  it('refuses to be issued twice', () => {
    const invoice = invoiceOf([lineOf(65_000, STANDARD)]);
    invoice.issue({ by: 'claire', sequence: 1, issueDate: '2026-04-02' });

    expect(() => {
      invoice.issue({ by: 'claire', sequence: 2, issueDate: '2026-04-03' });
    }).toThrow(InvoiceTransitionError);
    expect(invoice.number).toBe('SEC-2026-000001');
  });

  it('burns no number when issuing is refused', () => {
    // The ordering guarantee, and the reason it matters: a number allocated by an attempt that
    // then throws is a number no document carries, and a series whose only property is having no
    // gap has just acquired one (ADR-0018). The refusal reachable today is a bad sequence; from
    // Phase 3 the coherence check can refuse too, on totals read back from columns.
    const invoice = invoiceOf([lineOf(65_000, STANDARD)]);

    expect(() => {
      invoice.issue({ by: 'claire', sequence: 0, issueDate: '2026-04-02' });
    }).toThrow(InvalidSequenceError);
    expect(invoice.status).toBe('draft');
    expect(invoice.number).toBeNull();
    expect(invoice.series).toBeNull();
    expect(invoice.issueDate).toBeNull();

    // And the retry takes the number it was given, not the next one.
    invoice.issue({ by: 'claire', sequence: 1, issueDate: '2026-04-02' });
    expect(invoice.number).toBe('SEC-2026-000001');
  });

  it('keeps the totals it was issued with, whatever is asked of it afterwards', () => {
    const invoice = invoiceOf([lineOf(65_000, STANDARD)]);
    invoice.issue({ by: 'claire', sequence: 1, issueDate: '2026-04-02' });

    // The documentary freeze at the level of the document. In Phase 3 these totals are columns,
    // and this getter is what guarantees the printed page reads them rather than recomputing.
    expect(invoice.totals).toStrictEqual({
      totalExcludingVatCents: 65_000,
      vatTotalCents: 13_000,
      totalIncludingVatCents: 78_000,
    });
  });

  it('is cancelled only from issued, and keeps everything it printed', () => {
    const draft = invoiceOf([lineOf(65_000, STANDARD)]);

    expect(() => {
      draft.cancelByCreditNote();
    }).toThrow(InvoiceTransitionError);

    draft.issue({ by: 'claire', sequence: 7, issueDate: '2026-04-02' });
    draft.cancelByCreditNote();

    expect(draft.status).toBe('cancelledByCreditNote');
    expect(draft.number).toBe('SEC-2026-000007');
    expect(draft.totals.totalExcludingVatCents).toBe(65_000);
    expect(() => {
      draft.cancelByCreditNote();
    }).toThrow(InvoiceTransitionError);
  });
});

describe('the number series', () => {
  it('is keyed on the entity and the fiscal year', () => {
    // The entity is in the key although only one exists: a second one added to a series keyed on
    // the year alone renumbers the whole history.
    expect(seriesKeyOf(SELLER, '2026-04-02')).toStrictEqual({
      entityId: 'entity-fr',
      fiscalYear: 2026,
    });
    expect(sameSeries(seriesKeyOf(SELLER, '2026-01-01'), seriesKeyOf(SELLER, '2026-12-31'))).toBe(
      true,
    );
    expect(sameSeries(seriesKeyOf(SELLER, '2026-12-31'), seriesKeyOf(SELLER, '2027-01-01'))).toBe(
      false,
    );
  });

  it('numbers a document without saying which kind it is', () => {
    // One series for invoices and credit notes together (ADR-0018). A `FA-`/`AV-` prefix pair
    // would be two counters wearing one name, and chronological continuity would be a claim.
    const key = seriesKeyOf(SELLER, '2026-04-02');

    expect(documentNumber(SELLER, key, 1)).toBe('SEC-2026-000001');
    expect(documentNumber(SELLER, key, 999_999)).toBe('SEC-2026-999999');
  });

  it('refuses a sequence outside the range, because a counter that wraps is not gapless', () => {
    const key = seriesKeyOf(SELLER, '2026-04-02');

    expect(() => documentNumber(SELLER, key, 0)).toThrow(InvalidSequenceError);
    expect(() => documentNumber(SELLER, key, 1_000_000)).toThrow(InvalidSequenceError);
    expect(() => documentNumber(SELLER, key, 1.5)).toThrow(InvalidSequenceError);
  });
});
