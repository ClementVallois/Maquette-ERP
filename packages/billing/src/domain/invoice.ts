import { type IsoDate, periodToIso, type Period } from '@erp/platform';

import type { Client, PostalAddress } from './client.ts';
import { EmptyInvoiceError, LineOutsideInvoicePeriodError } from './errors.ts';
import type { ConsultantId, ClientId, InvoiceId } from './ids.ts';
import type { InvoiceLine } from './invoice-line.ts';
import type { InvoiceStatus } from './invoice-status.ts';
import type { LegalMentions } from './mentions.ts';
import { applyRate } from './money.ts';
import { type PaymentTerms, dueDate } from './payment-terms.ts';
import type { LegalEntity } from './seller.ts';
import { NOT_CHARGED_MENTIONS, type VatTreatment, vatGroupKey } from './vat.ts';

/**
 * The client as the document states it, copied at drafting. An invoice is a statement of what was
 * agreed when it was issued: if the client moves office, the invoice already sent keeps the
 * address it was sent to.
 */
export interface BilledParty {
  readonly clientId: ClientId;
  readonly name: string;
  readonly siren: string | null;
  readonly intraCommunityVatNumber: string | null;
  readonly billingAddress: PostalAddress;
  /** A mandatory field of the reform. Falls back to the billing address, and says so by carrying it. */
  readonly deliveryAddress: PostalAddress;
}

export function billedParty(source: Client): BilledParty {
  return {
    clientId: source.id,
    name: source.name,
    siren: source.siren,
    intraCommunityVatNumber: source.intraCommunityVatNumber,
    billingAddress: source.billingAddress,
    deliveryAddress: source.deliveryAddress ?? source.billingAddress,
  };
}

/**
 * One row of the recapitulative the invoice is legally required to print: a rate, the base taxed
 * at it, and the tax. A group that carries no French VAT has **no** tax amount — `null`, not zero
 * — and carries the mention that says why instead (ADR-0010).
 */
export interface VatGroup {
  readonly key: string;
  readonly treatment: VatTreatment;
  readonly baseCents: number;
  readonly vatCents: number | null;
  readonly mention: string | null;
}

export interface InvoiceTotals {
  readonly totalExcludingVatCents: number;
  readonly vatTotalCents: number;
  readonly totalIncludingVatCents: number;
}

/**
 * A demand for payment. Holds state, so it is a class and everything a caller can do to it is a
 * named intention — there is no setter, and the lines are handed out as a copy.
 *
 * Every mandatory mention is a field of this object rather than a line of a template (ADR-0017).
 * A template that prints them is a template that can stop printing them, and nothing fails.
 */
export class Invoice {
  readonly #id: InvoiceId;
  readonly #seller: LegalEntity;
  readonly #billedTo: BilledParty;
  /** The month the work covers, `YYYY-MM`. Printed as the period of execution. */
  readonly #supplyPeriod: string;
  readonly #lines: readonly InvoiceLine[];
  readonly #terms: PaymentTerms;
  readonly #mentions: LegalMentions;
  /**
   * Whose validation produced these lines. Carried so that the second rule of separation of
   * duties can be held here without `billing` importing `timesheet` (ADR-0006): the identity
   * travels with the fact, in the event payload.
   */
  readonly #validatedBy: readonly ConsultantId[];

  #status: InvoiceStatus = 'draft';

  private constructor(input: {
    id: InvoiceId;
    seller: LegalEntity;
    billedTo: BilledParty;
    supplyPeriod: string;
    lines: readonly InvoiceLine[];
    terms: PaymentTerms;
    mentions: LegalMentions;
    validatedBy: readonly ConsultantId[];
  }) {
    this.#id = input.id;
    this.#seller = input.seller;
    this.#billedTo = input.billedTo;
    this.#supplyPeriod = input.supplyPeriod;
    this.#lines = [...input.lines];
    this.#terms = input.terms;
    this.#mentions = input.mentions;
    this.#validatedBy = [...input.validatedBy];
  }

  static draft(input: {
    id: InvoiceId;
    seller: LegalEntity;
    billedTo: BilledParty;
    supplyPeriod: Period;
    lines: readonly InvoiceLine[];
    terms: PaymentTerms;
    mentions: LegalMentions;
    validatedBy: readonly ConsultantId[];
  }): Invoice {
    const supplyPeriod = periodToIso(input.supplyPeriod);

    if (input.lines.length === 0) {
      throw new EmptyInvoiceError(input.id);
    }
    for (const line of input.lines) {
      if (line.origin.period !== supplyPeriod) {
        throw new LineOutsideInvoicePeriodError(input.id, supplyPeriod, line.origin.period);
      }
    }

    return new Invoice({ ...input, supplyPeriod });
  }

  get id(): InvoiceId {
    return this.#id;
  }

  get status(): InvoiceStatus {
    return this.#status;
  }

  get seller(): LegalEntity {
    return this.#seller;
  }

  get billedTo(): BilledParty {
    return this.#billedTo;
  }

  get supplyPeriod(): string {
    return this.#supplyPeriod;
  }

  get lines(): readonly InvoiceLine[] {
    return [...this.#lines];
  }

  get terms(): PaymentTerms {
    return this.#terms;
  }

  get mentions(): LegalMentions {
    return this.#mentions;
  }

  get validatedBy(): readonly ConsultantId[] {
    return [...this.#validatedBy];
  }

  dueDateFrom(issueDate: IsoDate): IsoDate {
    return dueDate(this.#terms, issueDate);
  }

  /**
   * The recapitulative, and the one place VAT is computed. Lines are grouped by rate, the base is
   * summed over the group, and the rate is applied **once** to that sum — which is what "rounded
   * per rate" means (ADR-0010). Rounding each line and adding the results is a different number,
   * and it is the one-cent discrepancy accounting reports.
   */
  get vatBreakdown(): readonly VatGroup[] {
    const groups = new Map<string, { treatment: VatTreatment; baseCents: number }>();

    for (const line of this.#lines) {
      const key = vatGroupKey(line.vat);
      const group = groups.get(key) ?? { treatment: line.vat, baseCents: 0 };
      groups.set(key, {
        treatment: group.treatment,
        baseCents: group.baseCents + line.amountCents,
      });
    }

    return [...groups]
      .map(([key, group]) => ({
        key,
        treatment: group.treatment,
        baseCents: group.baseCents,
        vatCents:
          group.treatment.kind === 'taxable'
            ? applyRate(group.baseCents, group.treatment.basisPoints)
            : null,
        mention:
          group.treatment.kind === 'taxable' ? null : NOT_CHARGED_MENTIONS[group.treatment.reason],
      }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  get totals(): InvoiceTotals {
    const totalExcludingVatCents = this.#lines.reduce((sum, line) => sum + line.amountCents, 0);
    const vatTotalCents = this.vatBreakdown.reduce((sum, group) => sum + (group.vatCents ?? 0), 0);

    return {
      totalExcludingVatCents,
      vatTotalCents,
      totalIncludingVatCents: totalExcludingVatCents + vatTotalCents,
    };
  }
}
