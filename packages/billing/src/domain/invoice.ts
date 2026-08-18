import { type IsoDate, periodToIso, type Period } from '@erp/platform';

import type { Client, PostalAddress } from './client.ts';
import {
  assertDocumentAddsUp,
  type DocumentTotals,
  type VatGroup,
  totalsOf,
  vatBreakdownOf,
} from './document.ts';
import {
  EmptyInvoiceError,
  InvoiceTransitionError,
  LineOutsideInvoicePeriodError,
  ValidatorCannotIssueError,
} from './errors.ts';
import type { ConsultantId, ClientId, InvoiceId, OfficeId } from './ids.ts';
import type { InvoiceLine } from './invoice-line.ts';
import type { InvoiceStatus } from './invoice-status.ts';
import type { LegalMentions } from './mentions.ts';
import { documentNumber, type SeriesKey, seriesKeyOf } from './numbering.ts';
import { type PaymentTerms, dueDate } from './payment-terms.ts';
import type { LegalEntity } from './seller.ts';

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
 * A demand for payment. Holds state, so it is a class and everything a caller can do to it is a
 * named intention — there is no setter, and the lines are handed out as a copy.
 *
 * Every mandatory mention is a field of this object rather than a line of a template (ADR-0017).
 * A template that prints them is a template that can stop printing them, and nothing fails.
 */
export class Invoice {
  readonly #id: InvoiceId;
  readonly #officeId: OfficeId;
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
  #number: string | null = null;
  #issueDate: IsoDate | null = null;
  #series: SeriesKey | null = null;
  /** Computed at drafting, frozen at issuance. What is printed is what was checked. */
  #totals: DocumentTotals | null = null;

  private constructor(input: {
    id: InvoiceId;
    officeId: OfficeId;
    seller: LegalEntity;
    billedTo: BilledParty;
    supplyPeriod: string;
    lines: readonly InvoiceLine[];
    terms: PaymentTerms;
    mentions: LegalMentions;
    validatedBy: readonly ConsultantId[];
  }) {
    this.#id = input.id;
    this.#officeId = input.officeId;
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
    officeId: OfficeId;
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

  static reconstitute(input: {
    id: InvoiceId;
    officeId: OfficeId;
    status: InvoiceStatus;
    seller: LegalEntity;
    billedTo: BilledParty;
    supplyPeriod: string;
    lines: readonly InvoiceLine[];
    terms: PaymentTerms;
    mentions: LegalMentions;
    validatedBy: readonly ConsultantId[];
    number: string | null;
    issueDate: IsoDate | null;
    series: SeriesKey | null;
    totals: DocumentTotals | null;
  }): Invoice {
    const invoice = new Invoice({
      id: input.id,
      officeId: input.officeId,
      seller: input.seller,
      billedTo: input.billedTo,
      supplyPeriod: input.supplyPeriod,
      lines: input.lines,
      terms: input.terms,
      mentions: input.mentions,
      validatedBy: input.validatedBy,
    });
    invoice.#status = input.status;
    invoice.#number = input.number;
    invoice.#issueDate = input.issueDate;
    invoice.#series = input.series;
    invoice.#totals = input.totals;
    return invoice;
  }

  get id(): InvoiceId {
    return this.#id;
  }

  get officeId(): OfficeId {
    return this.#officeId;
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

  get vatBreakdown(): readonly VatGroup[] {
    return vatBreakdownOf(this.#lines);
  }

  /**
   * The totals as they stand. Once the invoice is issued this returns the **frozen** copy rather
   * than a fresh computation: what is printed on a legal document is what was checked when it was
   * issued, and a total that recomputes is a total that can change.
   */
  get totals(): DocumentTotals {
    return this.#totals ?? totalsOf(this.#lines);
  }

  get number(): string | null {
    return this.#number;
  }

  get issueDate(): IsoDate | null {
    return this.#issueDate;
  }

  get series(): SeriesKey | null {
    return this.#series;
  }

  /**
   * The invoice leaves. This is the transition after which nothing changes — the number, the date
   * and the totals are fixed here and the only correction from now on is a `CreditNote`.
   *
   * `by` is checked against whoever validated the days: the second rule of separation of duties
   * (ADR-0006), held inside `billing` because the validator's identity travelled in the event
   * payload rather than being asked of `timesheet`.
   */
  issue(input: { by: ConsultantId; sequence: number; issueDate: IsoDate }): void {
    if (this.#status !== 'draft') {
      throw new InvoiceTransitionError(this.#id, this.#status, 'issued');
    }
    if (this.#validatedBy.includes(input.by)) {
      throw new ValidatorCannotIssueError(this.#id, input.by);
    }

    // Everything that can refuse runs first, and nothing below it touches this object until all
    // of it has passed. A number allocated by an attempt that then throws is a number no document
    // carries, and that is a gap in a series whose only property is having none (ADR-0018). The
    // same ordering is written and tested one file over, in `creditNote`.
    const series = seriesKeyOf(this.#seller, input.issueDate);
    const number = documentNumber(this.#seller, series, input.sequence);
    const totals = totalsOf(this.#lines);

    // The gate BUILD-RULES puts before a document leaves. Tautological here and not written for
    // here — Phase 3 reconstructs a document from stored rows, where the totals are columns and
    // the lines are another table, and the two can disagree. That is also when this ordering
    // stops being theoretical.
    assertDocumentAddsUp({
      id: this.#id,
      lines: this.#lines,
      vatBreakdown: this.vatBreakdown,
      totals,
    });

    this.#number = number;
    this.#series = series;
    this.#issueDate = input.issueDate;
    this.#totals = totals;
    this.#status = 'issued';
  }

  /**
   * A `CreditNote` has reversed this invoice in full. The invoice itself is untouched — it keeps
   * its number, its lines and its totals, because an issued invoice is never modified. Only the
   * status records that another document now cancels it.
   */
  cancelByCreditNote(): void {
    if (this.#status !== 'issued') {
      throw new InvoiceTransitionError(this.#id, this.#status, 'cancelled by a credit note');
    }

    this.#status = 'cancelledByCreditNote';
  }
}
