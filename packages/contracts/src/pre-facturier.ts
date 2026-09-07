/**
 * Package 09 (P1 audit): `GET /api/v1/pre-facturier?period=` — the shape both
 * `apps/api/src/routes/pre-facturier.ts` and `apps/web/src/features/pre-facturier/types.ts` now
 * share, moved verbatim from the SPA's own hand-typed copy (confirmed against the route and the
 * composition it reads, not guessed — see that file's own history before this move).
 *
 * `DeclineReason` is repeated as a literal here rather than imported from `@erp/billing`, the
 * same reasoning `DashboardCraStatus` already gives (`dashboard.ts`'s own header): a shared
 * contract does not import a business module (`contracts-has-no-business-dependency`, ADR-0110).
 */
export type DeclineReason = 'notRegie' | 'unknownMission' | 'noAgreedRate' | 'unknownClient';

export interface PreFacturierSummary {
  readonly billableCents: number;
  /**
   * Package 09 (P1 audit), sub-step 4/4: named `lateQuarterDays`, not `lateDays` — the field
   * always carried quarter-days (`frenchDays` takes it directly, never divided by four), and the
   * old name was the misleading one the audit asked to be coordinated with its only client
   * rather than kept forever. Same unit as `composition.lateQuarterDays`
   * (`apps/api/src/composition/pre-facturier.ts`), which this field has always mirrored — the
   * rename makes the two names agree, not just the two values.
   */
  readonly lateQuarterDays: number;
  readonly craCount: number;
}

export interface PreFacturierInvoiceRow {
  readonly id: string;
  readonly status: 'draft' | 'issued' | 'cancelledByCreditNote';
  readonly supplyPeriod: string;
  readonly billedToName: string;
  readonly invoiceNumber: string | null;
  readonly issueDate: string | null;
  /** Never null: a draft's TTC is computed from its lines. See `totalsAreProvisional`. */
  readonly totalTtcCents: number | null;
  readonly totalsAreProvisional: boolean;
  /** Rank A7's discriminant: the consultant whose Cra drafted this invoice. */
  readonly consultantName: string;
  readonly missionNames: readonly string[];
  readonly lineCount: number;
  /** The source Cra's validation timestamp — the closest thing this schema has to "created at". */
  readonly createdAt: string | null;
}

export interface PreFacturierCraRow {
  readonly craId: string;
  readonly consultantId: string;
  readonly consultantName: string;
  readonly status: 'draft' | 'submitted' | 'refused' | 'validated';
  readonly late: boolean;
  readonly recordedQuarterDays: number;
  readonly blockingReasons: readonly DeclineReason[];
  readonly decidable: boolean;
}

export interface PreFacturierResponse {
  readonly period: string | null;
  readonly offeredPeriods: readonly string[];
  readonly summary: PreFacturierSummary;
  readonly invoices: readonly PreFacturierInvoiceRow[];
  readonly cras: readonly PreFacturierCraRow[];
  readonly pagination: {
    readonly cras: { readonly total: number; readonly limit: number; readonly offset: number };
    readonly invoices: { readonly total: number; readonly limit: number; readonly offset: number };
  };
}
