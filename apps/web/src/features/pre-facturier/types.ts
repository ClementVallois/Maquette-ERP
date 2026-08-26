/**
 * `GET /api/v1/pre-facturier?period=` — Annexe A points at frontend-plan.md task 5.1 by name and
 * documents no shape of its own; task 5.1's prose (fenced JSON block) was the first draft of this
 * file, and it turned out to disagree with what the route actually returns in two places, both
 * confirmed against `apps/api/src/routes/api.ts` (the handler's own object literal, ~line 372) and
 * against a live call (`curl` with a `manager-paris` cookie, `?period=2026-06`, seed reset) rather
 * than guessed (rule 0bis.8):
 *
 * - **No HT (`totalExcludingVatCents`) field exists on `invoices[]`.** The composition
 *   (`composition/pre-facturier.ts`) computes a `BillableRow` with both HT and TTC from the live
 *   aggregate, but the route hands back `composition.invoices` — the raw, lighter
 *   `InvoiceListItem[]` read `GET /api/v1/invoices` also answers — not `composition.billable`. Only
 *   the **aggregate** total (`summary.billableCents`, HT) survives onto the wire; no per-row HT
 *   does. Confirmed deliberate, not an oversight: `routes/pre-facturier.int.test.ts` asserts this
 *   exact shape with `totalTtcCents: null` on a draft row. Recorded in
 *   `docs/open-questions.md` (row dated 2026-08-26): task 7.1's own prose asks for an HT column
 *   this endpoint cannot fill; the table below renders TTC only.
 * - **`invoices[].totalTtcCents` is `null` until the invoice is issued** (Phase 8), which in
 *   Phase 7 is every row — validating a Cra only ever drafts an invoice, it does not issue one.
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
  readonly totalTtcCents: number | null;
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
  readonly summary: PreFacturierSummary;
  readonly invoices: readonly PreFacturierInvoiceRow[];
  readonly cras: readonly PreFacturierCraRow[];
}
