/**
 * `GET /api/v1/pre-facturier?period=` — the shape both
 * `apps/api/src/routes/pre-facturier.ts` and `apps/web/src/features/pre-facturier/types.ts` read
 * from here, rather than each restating it.
 *
 * `DeclineReason` is repeated as a literal here rather than imported from `@erp/billing`, the
 * same reasoning `DashboardCraStatus` already gives (`dashboard.ts`'s own header): a shared
 * contract does not import a business module (`contracts-has-no-business-dependency`, ADR-0110).
 */
export type DeclineReason = 'notRegie' | 'unknownMission' | 'noAgreedRate' | 'unknownClient';

export interface PreFacturierSummary {
  readonly billableCents: number;
  /**
   * `lateQuarterDays`, not `lateDays`: the field carries quarter-days and `frenchDays` takes it
   * directly, never divided by four. Same unit and same name as `composition.lateQuarterDays`
   * (`apps/api/src/composition/pre-facturier.ts`), which it mirrors.
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
