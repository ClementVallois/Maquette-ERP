import { BusinessError } from '@erp/platform';

/**
 * The VAT reference was asked about a date it does not cover. Loud on purpose, for the reason
 * ADR-0004 gives about the working calendar: a silent answer here would either invent a rate or
 * charge nothing, and both leave a legal document that is wrong in a way nobody notices.
 */
export class NoVatRateError extends BusinessError {
  readonly problemType = '/problems/no-vat-rate';

  constructor(territoriality: string, date: string) {
    super(`no VAT rate is recorded for ${territoriality} on ${date}`, { territoriality, date });
  }
}

/** An agreed payment term above the legal cap is void, not merely unusual (art. L441-10). */
export class PaymentTermsTooLongError extends BusinessError {
  readonly problemType = '/problems/payment-terms-too-long';

  constructor(kind: string, days: number, cap: number) {
    super(
      `${kind} payment terms are capped at ${String(cap)} days, and ${String(days)} was agreed`,
      {
        kind,
        days,
        cap,
      },
    );
  }
}

/** An invoice with no line is not a document. Nothing is owed, and nothing says what for. */
export class EmptyInvoiceError extends BusinessError {
  readonly problemType = '/problems/empty-invoice';

  constructor(invoiceId: string) {
    super(`an invoice carries at least one line (${invoiceId})`, { invoiceId });
  }
}

/** A line whose worked month is not the month the invoice says it covers. */
export class LineOutsideInvoicePeriodError extends BusinessError {
  readonly problemType = '/problems/line-outside-invoice-period';

  constructor(invoiceId: string, period: string, linePeriod: string) {
    super(`${invoiceId} covers ${period} and carries a line worked in ${linePeriod}`, {
      invoiceId,
      period,
      linePeriod,
    });
  }
}
