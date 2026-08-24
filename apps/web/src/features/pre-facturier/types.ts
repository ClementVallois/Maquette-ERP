import type { InvoiceListItem } from '@/features/cra/types';

// Phase 5 (task 5.1) builds `GET /api/v1/pre-facturier?period=`.
/**
 * The endpoint does not exist yet
 * (frontend-plan.md task 3.7: "do not build ahead of the endpoints"), so this shape is transcribed
 * from Annexe A's documented response only, marked here rather than verified against running
 * code. No `api.ts`/`hooks.ts` for this feature until Phase 7 first calls it.
 *
 * `CraSummary.blockingReasons` is `string[]` (Annexe A: "motifs bloquants en liste") rather than
 * the `DeclineReason` union `features/cra/types.ts` names, because the pré-facturier's summary row
 * has not been shown, by the API that does not exist yet, to carry the same closed vocabulary as a
 * `DeclinedDay` — narrowing it here would be a guess Annexe A does not make.
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
