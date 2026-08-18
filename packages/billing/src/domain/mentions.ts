import { InvalidValueError } from '@erp/platform';

/**
 * The mandatory mentions an invoice carries that are neither a party, an amount nor a date.
 * Modelled on the document, not written into a template (ADR-0017): a template that prints them
 * is a template that can stop printing them, and no test notices.
 */

/** Fixed by decree (art. D441-5 du code de commerce): 40 € for recovery costs. */
export const RECOVERY_INDEMNITY_CENTS = 4000;

/**
 * A discount for early payment. The mention is mandatory **even to say there is none**, which is
 * why "none" is a value of the type and not the absence of a field.
 */
export type EarlyPaymentDiscount =
  { readonly kind: 'none' } | { readonly kind: 'rate'; readonly basisPoints: number };

/**
 * What the invoice covers, in the reform's terms. Consulting days are a supply of services; the
 * category is a mandatory field of an electronic invoice and it decides which VAT date rules
 * apply, so it is on the document rather than assumed.
 */
export const OPERATION_CATEGORIES = ['services', 'goods', 'mixed'] as const;

export type OperationCategory = (typeof OPERATION_CATEGORIES)[number];

export interface LegalMentions {
  /** The annual late-payment interest rate, in basis points. Never below the legal floor. */
  readonly latePaymentBasisPoints: number;
  readonly recoveryIndemnityCents: number;
  readonly earlyPaymentDiscount: EarlyPaymentDiscount;
  readonly operationCategory: OperationCategory;
  /**
   * Whether the seller has opted to account for VAT on debits. Consulting services are otherwise
   * taxed on collection, and the option has to be printed — it tells the customer when they may
   * deduct. It is also what fixes the VAT date at the invoice date rather than at payment.
   */
  readonly vatOnDebitsOption: boolean;
}

/**
 * Three times the legal interest rate is the floor most French terms use; the absolute floor is
 * the ECB refinancing rate plus ten points. Below it the clause is void and the legal rate
 * applies instead, so a value under it is refused rather than printed.
 */
export const MINIMUM_LATE_PAYMENT_BASIS_POINTS = 1000;

export function legalMentions(input: LegalMentions): LegalMentions {
  if (
    !Number.isSafeInteger(input.latePaymentBasisPoints) ||
    input.latePaymentBasisPoints < MINIMUM_LATE_PAYMENT_BASIS_POINTS
  ) {
    throw new InvalidValueError(
      'mentions.latePaymentBasisPoints',
      input.latePaymentBasisPoints,
      `at least ${String(MINIMUM_LATE_PAYMENT_BASIS_POINTS)} basis points`,
    );
  }
  if (input.recoveryIndemnityCents !== RECOVERY_INDEMNITY_CENTS) {
    // Fixed by decree, so it is not a parameter of the firm's commercial policy. It is on the
    // model because it is printed, and checked because a different value is not a choice.
    throw new InvalidValueError(
      'mentions.recoveryIndemnityCents',
      input.recoveryIndemnityCents,
      `${String(RECOVERY_INDEMNITY_CENTS)} cents, fixed by decree`,
    );
  }
  if (
    input.earlyPaymentDiscount.kind === 'rate' &&
    (!Number.isSafeInteger(input.earlyPaymentDiscount.basisPoints) ||
      input.earlyPaymentDiscount.basisPoints <= 0)
  ) {
    throw new InvalidValueError(
      'mentions.earlyPaymentDiscount',
      input.earlyPaymentDiscount,
      'a rate above zero, or none',
    );
  }

  return input;
}
