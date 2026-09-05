/**
 * `Annexe A — Billing`. Shapes verified against the route handlers (`apps/api/src/routes/api.ts`,
 * `GET /api/v1/invoices`, `GET /api/v1/invoices/:id`) and the domain types they compose
 * (`packages/billing/src/domain/invoice.ts`, `invoice-line.ts`, `document.ts`, `vat.ts`,
 * `mentions.ts`, `payment-terms.ts`, `seller.ts`, `client.ts`) rather than guessed from Annexe A's
 * prose (rule 0bis.8). `InvoiceListItem` is declared **here**, not in `features/cra/types.ts` where
 * it first landed: the invoice is billing's record, three responses project it (the invoice list,
 * the pré-facturier, and the validation response), and the feature that owns the record is the one
 * that owns its shape. `features/cra` imports it from here for `ValidationResponse`; nothing here
 * imports from `features/cra`, so the arrow the sealed packages forbid — billing reaching into
 * timesheet — does not exist in the SPA either.
 *
 * `dueDate` is deliberately absent: `Invoice.dueDateFrom(issueDate)` exists in the domain and
 * `LABELS.invoice.dueDate` has a French label for it, but the route's response object literal does
 * not return it. Left out here rather than guessed at — a real finding for whichever phase (8)
 * first needs it on this screen, not a silent addition.
 *
 * Only `types.ts` exists for this feature in Phase 3 (task 3.7). `api.ts`/`hooks.ts` land in
 * Phase 8 with the invoice list and detail screens; that is also where the optional zod parsing at
 * the boundary belongs for `InvoiceDetail`, the second of the two "complex payloads" task 3.7
 * names.
 */

export type InvoiceStatus = 'draft' | 'issued' | 'cancelledByCreditNote';

/**
 * The list projection of an invoice, shared by `GET /api/v1/invoices`, Phase 5.1's
 * `GET /api/v1/pre-facturier` and `POST /api/v1/cras/:id/validation` (Annexe A gives all three the
 * same shape). `invoiceNumber` and `issueDate` are `null` until the invoice is issued — a draft
 * has no number (ADR-0007's gapless sequence allocates one at issuance, never before).
 * `totalTtcCents` is never null: for a draft it is computed from the lines rather than frozen, and
 * `totalsAreProvisional` (true only for a draft) is what tells the reader the number can still
 * move before issuance.
 */
export interface InvoiceListItem {
  readonly id: string;
  readonly status: InvoiceStatus;
  readonly supplyPeriod: string;
  readonly billedToName: string;
  readonly invoiceNumber: string | null;
  readonly issueDate: string | null;
  readonly totalTtcCents: number | null;
  readonly totalsAreProvisional: boolean;
  /**
   * Rank A7: what tells two invoices to the same client, same month, apart. `GET /api/v1/invoices`
   * resolves them the same way `PreFacturierInvoiceRow` does — the source Cra `saveDraft` recorded
   * (exactly one per invoice) and its consultant/mission(s).
   */
  readonly consultantName: string;
  readonly missionNames: readonly string[];
  readonly lineCount: number;
  readonly createdAt: string | null;
}

export interface InvoiceListResponse {
  readonly invoices: readonly InvoiceListItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly statusCounts: Readonly<Record<'all' | InvoiceStatus, number>>;
}

export interface PostalAddress {
  readonly line1: string;
  readonly line2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
}

export interface BilledParty {
  readonly clientId: string;
  readonly name: string;
  readonly siren: string | null;
  readonly intraCommunityVatNumber: string | null;
  readonly billingAddress: PostalAddress;
  readonly deliveryAddress: PostalAddress;
}

export interface Seller {
  readonly id: string;
  readonly name: string;
  readonly legalForm: string;
  readonly shareCapitalCents: number;
  readonly siren: string;
  readonly intraCommunityVatNumber: string;
  readonly rcsRegistration: string;
  readonly address: PostalAddress;
  readonly numberPrefix: string;
}

export type PaymentTerms =
  | { readonly kind: 'net'; readonly days: number }
  | { readonly kind: 'endOfMonth'; readonly days: number };

export type OperationCategory = 'services' | 'goods' | 'mixed';

export type EarlyPaymentDiscount =
  { readonly kind: 'none' } | { readonly kind: 'rate'; readonly basisPoints: number };

export interface LegalMentions {
  readonly latePaymentBasisPoints: number;
  readonly recoveryIndemnityCents: number;
  readonly earlyPaymentDiscount: EarlyPaymentDiscount;
  readonly operationCategory: OperationCategory;
  readonly vatOnDebitsOption: boolean;
}

export type NotChargedReason = 'territoryOutsideVatScope' | 'reverseChargeEuB2b';

export type VatTreatment =
  | { readonly kind: 'taxable'; readonly basisPoints: number }
  | { readonly kind: 'notCharged'; readonly reason: NotChargedReason };

export interface RegieDaysOrigin {
  readonly kind: 'RegieDays';
  readonly missionId: string;
  readonly craId: string;
  readonly period: string;
  readonly quarterDays: number;
  /**
   * A `Tjm`, present here on purpose and not a violation of "`Cjm`, `Tjm` et la marge n'apparaissent
   * jamais dans une vue de liste" (BUILD-RULES § Authorization) or Annexe C.12's own restatement of
   * it: this field lives on `InvoiceDetail`, a **single-record** read (`GET /api/v1/invoices/:id`),
   * never on `InvoiceListItem` — no list projection anywhere in this repository carries a `Tjm`.
   * ADR-0034 requires it here specifically: "An invoice line **copies** its `Tjm` and rate; it does
   * not reference them" — the frozen rate on the line **is** the audit trail, and the SSR printable
   * invoice (`GET /facture/:id`) already prints the daily rate it derives from, `unitPriceCents *
   * QUARTER_DAYS_PER_DAY` under `LABELS.invoice.unitPrice` ("Prix unitaire (jour)").
   * Whether the SPA's detail screen should also render `origin.tjmCents` itself (as opposed to only
   * `unitPriceCents`, which is already derived from it) is not decided here — see
   * `docs/open-questions.md`, row dated 2026-08-24, naming Phase 8.
   */
  readonly tjmCents: number;
}

export interface InvoiceLine {
  readonly designation: string;
  readonly origin: RegieDaysOrigin;
  readonly quantityQuarterDays: number;
  readonly unitPriceCents: number;
  readonly amountCents: number;
  readonly vat: VatTreatment;
}

export interface VatGroup {
  readonly key: string;
  readonly treatment: VatTreatment;
  readonly baseCents: number;
  readonly vatCents: number | null;
  readonly mention: string | null;
}

export interface DocumentTotals {
  readonly totalExcludingVatCents: number;
  readonly vatTotalCents: number;
  readonly totalIncludingVatCents: number;
}

export interface InvoiceLineage {
  readonly craId: string;
  readonly period: string;
  readonly missionId: string;
  readonly missionName: string;
  readonly sourceDays: readonly {
    readonly day: string;
    readonly quarterDays: number;
  }[];
  readonly quantityQuarterDays: number;
  readonly tjmCents: number;
  readonly lineAmountCents: number;
  /** The legal recap group, not a made-up per-line VAT allocation. */
  readonly vatGroup: VatGroup | null;
  readonly invoiceTotalTtcCents: number;
}

/**
 * The invoice detail (`GET /api/v1/invoices/:id`) — the second of the two "complex payloads"
 * frontend-plan.md task 3.7 names for optional zod parsing at the fetch boundary. Not written
 * here: the parser belongs in this feature's `api.ts`, which does not exist yet in Phase 3.
 * `totals` is never null: a draft's totals are computed from its lines rather than frozen, and
 * `totalsAreProvisional` (true only for `status === 'draft'`) says whether they can still move.
 */
export interface InvoiceDetail {
  readonly id: string;
  readonly status: InvoiceStatus;
  readonly supplyPeriod: string;
  readonly invoiceNumber: string | null;
  readonly issueDate: string | null;
  readonly billedTo: BilledParty;
  readonly seller: Seller;
  readonly terms: PaymentTerms;
  readonly mentions: LegalMentions;
  readonly lines: readonly InvoiceLine[];
  readonly vatBreakdown: readonly VatGroup[];
  readonly totals: DocumentTotals;
  readonly totalsAreProvisional: boolean;
  readonly timeline: readonly {
    readonly kind: 'validated' | 'drafted' | 'issued';
    readonly at: string;
    readonly actorName: string | null;
  }[];
  readonly lineage: readonly InvoiceLineage[];
}

export interface IssuanceResponse {
  readonly invoiceId: string;
  readonly replayed: boolean;
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly totalTtcCents: number;
}

/**
 * `GET /api/v1/invoices/history` (Rank A2) — the dashboard's history chart. Two honest series:
 * every (year, status) this office's invoices span, and the three dense 2026 months' billable HT.
 * `year` is a four-digit string, the `supply_period` prefix `PgInvoiceRepository.countByYearAndStatus`
 * groups by.
 */
export interface InvoiceYearStatusCount {
  readonly year: string;
  readonly status: InvoiceStatus;
  readonly count: number;
}

export interface DenseMonthBillable {
  readonly period: string;
  readonly billableCents: number;
}

export interface InvoiceHistoryResponse {
  readonly byYearAndStatus: readonly InvoiceYearStatusCount[];
  readonly denseMonths: readonly DenseMonthBillable[];
}
