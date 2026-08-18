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
