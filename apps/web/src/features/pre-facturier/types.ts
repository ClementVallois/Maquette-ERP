import type { InvoiceListItem } from '@/features/factures/types';

// Phase 5 (task 5.1) builds `GET /api/v1/pre-facturier?period=`.
/**
 * The endpoint does not exist yet (frontend-plan.md task 3.7: "do not build ahead of the
 * endpoints"), so this shape is transcribed from the response block written out in **task 5.1**
 * of the plan — Annexe A's Billing table only points at that task by name and documents no shape
 * of its own. Transcribed, not verified against running code, and marked as such here. No
 * `api.ts`/`hooks.ts` for this feature until Phase 7 first calls it.
 *
 * `PreFacturierCraRow.blockingReasons` is kept as `string[]` — the literal type task 5.1 writes
 * (`blockingReasons: [string]`) — rather than narrowed to the `DeclineReason` union
 * `features/cra/types.ts` names: the API that would settle whether a pré-facturier row carries the
 * same closed vocabulary as a `DeclinedDay` does not exist yet, so narrowing here would be a guess
 * the plan does not make.
 */
export interface PreFacturierSummary {
  readonly billableCents: number;
  readonly lateDays: number;
  readonly craCount: number;
}

export interface PreFacturierCraRow {
  readonly craId: string;
  readonly consultantId: string;
  readonly consultantName: string;
  readonly status: string;
  readonly late: boolean;
  readonly recordedHalfDays: number;
  readonly blockingReasons: readonly string[];
  readonly decidable: boolean;
}

export interface PreFacturierResponse {
  readonly period: string;
  readonly summary: PreFacturierSummary;
  readonly invoices: readonly InvoiceListItem[];
  readonly cras: readonly PreFacturierCraRow[];
}
