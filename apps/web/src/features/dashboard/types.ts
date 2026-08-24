// Phase 5 (task 5.3) builds `GET /api/v1/dashboard?period=YYYY-MM`.
/**
 * The endpoint does not exist yet (frontend-plan.md task 3.7: "do not build ahead of the
 * endpoints"), so this shape is transcribed from the per-role bullets of **task 5.3** of the plan
 * — Annexe A's Billing table only points at that task by name and documents no shape of its own.
 * Transcribed, not verified against running code. No `api.ts`/`hooks.ts` for this feature until
 * Phase 8 first calls it.
 *
 * One response type, three optional per-role slices, rather than three response types picked by a
 * discriminant the plan does not name: the endpoint answers "tous rôles connectés" with different
 * fields per role, and nothing in task 5.3 says how a caller tells which slice is present other
 * than checking which field exists — so each slice is optional here and Phase 8 narrows this on
 * contact with the real response.
 *
 * **Interdit** (task 5.3, in bold): no `cjmCents`, no `tjmCents`, no margin anywhere in this type —
 * BUILD-RULES' "`Cjm`, `Tjm` et la marge n'apparaissent jamais dans une vue de liste" applies to a
 * dashboard aggregate exactly as it does to a list.
 */
export interface ConsultantDashboard {
  readonly status: string;
  readonly recordedHalfDays: number;
  readonly remainingDays: number;
}

export interface ManagerDashboard {
  readonly craAwaitingDecision: number;
  readonly billableCents: number;
  readonly lateCras: number;
}

export interface BillingDashboard {
  readonly draftInvoices: number;
  readonly issuedInvoices: number;
  readonly totalTtcIssuedCents: number;
}

export interface DashboardResponse {
  readonly period: string;
  readonly consultant?: ConsultantDashboard;
  readonly manager?: ManagerDashboard;
  readonly billing?: BillingDashboard;
}
