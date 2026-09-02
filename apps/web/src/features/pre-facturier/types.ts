/**
 * `GET /api/v1/pre-facturier?period=` — Annexe A points at frontend-plan.md task 5.1 by name and
 * documents no shape of its own; task 5.1's prose (fenced JSON block) was the first draft of this
 * file, and it turned out to disagree with what the route actually returns, confirmed against
 * `apps/api/src/routes/api.ts` and `apps/api/src/composition/pre-facturier.ts` rather than guessed
 * (rule 0bis.8):
 *
 * - **`invoices[]` is `PreFacturierInvoiceRow` in the composition (`InvoiceListItem` plus a
 *   discriminant), not the bare `InvoiceListItem[]` `GET /api/v1/invoices` answers** — Rank A7
 *   added `consultantName`/`missionNames`/`lineCount`/`createdAt` so two drafts to the same client
 *   in the same month stop being indistinguishable rows.
 * - **`totalTtcCents` is never null** (Rank B1): a draft's TTC is computed from its lines rather
 *   than stored, and `totalsAreProvisional` says whether it is frozen yet.
 * - **`blockingReasons` narrows to `DeclineReason`, verified rather than left as `string[]`**:
 *   `blockingReasonsOf` (`routes/api.ts`) filters `CraRow['blocking']` to `kind === 'declined'`
 *   before mapping to `.reason`, so nothing but the closed four-value vocabulary reaches this
 *   field. A Cra blocked by its own workflow state (`notValidated`) contributes no entry here at
 *   all — `late`/`status` already carry that fact.
 */

export type DeclineReason = 'notRegie' | 'unknownMission' | 'noAgreedRate' | 'unknownClient';

export interface PreFacturierSummary {
  readonly billableCents: number;
  /** Quarter-days, despite the name — `frenchDays` takes this directly, never divided by four. */
  readonly lateDays: number;
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
}
