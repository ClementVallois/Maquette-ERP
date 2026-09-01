/**
 * `GET /api/v1/dashboard?period=` — task 5.3 built the route, task 8.4 is its first consumer.
 * This shape replaces a Phase 3 placeholder transcribed from task 5.3's prose bullets rather than
 * verified against code (that file's own header said so): the real route
 * (`apps/api/src/routes/api.ts`, ~line 469) answers a **discriminated union keyed by `role`**, not
 * three optional fields on one object, and two of the three per-role field sets use different
 * names than the prose implied. Confirmed against the handler and a live call (`curl`, each of the
 * three personas, `?period=2026-06`, seed reset) rather than guessed (rule 0bis.8):
 *
 * - consultant: `myMonthStatus` (`CraStatus | null` — `null` only when no Cra exists yet for the
 *   period), `recordedQuarterDays`, `remainingWorkableDays`, `refusedPeriods` (ADR-0082: every
 *   period currently `refused`, not only `period` above).
 * - manager: `pendingDecisions` (submitted Cras awaiting a decision, across every period —
 *   ADR-0082), `billableCents` (the requested period's own total — the same aggregate
 *   `/pre-facturier` shows in full for that period, ADR-0053/ADR-0065, so the two screens cannot
 *   disagree on it), `lateCras` (closed-period, non-`validated` Cras, across every period —
 *   ADR-0082 again).
 * - billing: `draftInvoices`, `issuedInvoices`, `totalTtcIssuedCents` — the one branch the Phase 3
 *   placeholder already had right.
 *
 * `period` is a **required** query parameter with no server-side default — confirmed live: a bare
 * `GET /api/v1/dashboard` (no `period`) answers `400 malformed-request`. `lib/period.ts`'s
 * `currentPeriod()` is what the SPA supplies.
 *
 * **Interdit** (task 5.3, in bold, restated by BUILD-RULES § Authorization): no `cjmCents`, no
 * `tjmCents`, no margin anywhere in this type or the route behind it — confirmed by reading the
 * handler, which never touches `consultantEconomics` or a `Cjm`/`Tjm` field on any branch.
 */

/**
 * The same four-value union `features/cra/types.ts` declares as `CraStatus`, repeated as a
 * literal here rather than imported: `docs/open-questions.md` (row dated 24/08/2026) left the
 * question of a boundary between SPA feature folders open, naming this phase as the one that
 * would make the real number of crossings visible. It stayed at exactly one (`cra` → `factures`,
 * `InvoiceListItem`) through this phase too — this type would have been the second, and a
 * four-literal union costs less repeated than a new cross-feature import costs decided-on-the-fly
 * (see this phase's checkpoint for the closed row).
 */
export type DashboardCraStatus = 'draft' | 'submitted' | 'validated' | 'refused';

export interface ConsultantDashboard {
  readonly period: string;
  readonly role: 'consultant';
  readonly myMonthStatus: DashboardCraStatus | null;
  readonly recordedQuarterDays: number;
  readonly remainingWorkableDays: number;
  /**
   * ADR-0082: every period currently `refused`, not only `period` above — a refusal from a month
   * the visitor has since moved on from still owes a correction, and stops showing anywhere on
   * this screen the moment `period` defaults past it. Usually holds at most one entry; may hold
   * `period` itself too (when this month's own refusal is what `myMonthStatus` already reports).
   */
  readonly refusedPeriods: readonly string[];
}

export interface ManagerDashboard {
  readonly period: string;
  readonly role: 'manager';
  readonly pendingDecisions: number;
  readonly billableCents: number;
  readonly lateCras: number;
}

export interface BillingDashboard {
  readonly period: string;
  readonly role: 'billing';
  readonly draftInvoices: number;
  readonly issuedInvoices: number;
  readonly totalTtcIssuedCents: number;
}

export type DashboardResponse = ConsultantDashboard | ManagerDashboard | BillingDashboard;
