import { addDays, endOfMonth, type IsoDate } from '@erp/platform';

import { PaymentTermsTooLongError } from './errors.ts';

/**
 * When the client has to pay, and the two forms French law allows for a business customer
 * (art. L441-10 du code de commerce). Both are capped, and the cap is validated rather than
 * documented: an agreed term above it is void, not merely unusual.
 */
export const MAX_NET_DAYS = 60;
export const MAX_END_OF_MONTH_DAYS = 45;

export type PaymentTerms =
  | { readonly kind: 'net'; readonly days: number }
  | { readonly kind: 'endOfMonth'; readonly days: number };

export function paymentTerms(terms: PaymentTerms): PaymentTerms {
  const cap = terms.kind === 'net' ? MAX_NET_DAYS : MAX_END_OF_MONTH_DAYS;

  if (!Number.isSafeInteger(terms.days) || terms.days < 0) {
    throw new PaymentTermsTooLongError(terms.kind, terms.days, cap);
  }
  if (terms.days > cap) {
    throw new PaymentTermsTooLongError(terms.kind, terms.days, cap);
  }

  return terms;
}

/**
 * The due date printed on the invoice.
 *
 * "45 jours fin de mois" has two accepted computations and the law does not pick one; the invoice
 * has to say which it used, which is why this is a decision and not a helper. ADR-0017 chooses
 * **add the days first, then move to the end of that month** — the shorter of the two — and names
 * the other. Reading it the other way round on a 15 March invoice gives 15 May instead of 30 April.
 */
export function dueDate(terms: PaymentTerms, issueDate: IsoDate): IsoDate {
  const shifted = addDays(issueDate, terms.days);

  return terms.kind === 'net' ? shifted : endOfMonth(shifted);
}
