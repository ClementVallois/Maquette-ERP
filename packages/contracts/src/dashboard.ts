/**
 * `GET /api/v1/dashboard?period=` and `GET /api/v1/org-chart` — the shape both
 * `apps/api/src/routes/dashboard.ts` and `apps/web/src/features/dashboard/types.ts` read from
 * here. `apps/web`'s `types.ts` re-exports these rather than restating them.
 */

/**
 * The same four-value union `packages/timesheet`'s own `CraStatus` is, repeated as a literal
 * here rather than imported: `apps/web` may not import a business module (ADR-0001/ADR-0015),
 * and this shared contract does not import one either (`contracts-has-no-business-dependency`,
 * ADR-0110) — a four-literal union costs less repeated than a rule exception would.
 */
export type DashboardCraStatus = 'draft' | 'submitted' | 'validated' | 'refused';

export interface DashboardActivity {
  readonly key: string;
  readonly kind: 'cra' | 'invoice';
  readonly recordId: string;
  readonly status: DashboardCraStatus | 'issued' | 'cancelledByCreditNote';
  readonly period: string;
  readonly name: string | null;
  readonly at: string;
  readonly consultantId?: string;
}

export interface ConsultantDashboard {
  readonly period: string;
  readonly availablePeriods: readonly string[];
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
  readonly recentActivity: readonly DashboardActivity[];
}

/** One row of a manager's "à faire maintenant" queue — a submitted Cra awaiting a decision. */
export interface ManagerQueueRow {
  readonly craId: string;
  readonly consultantId: string;
  readonly consultantName: string;
  readonly period: string;
  /** ISO timestamp of the submission this row is queued on, or `null` for a legacy row without one. */
  readonly statusChangedAt: string | null;
}

/**
 * How many of the manager's own office's current consultants are staffed on a client mission
 * versus sitting in `Intercontrat` **today** (ADR-0098) — not scoped to `period`
 * above, which is why it is its own field rather than folded into the figures that are.
 */
export interface ManagerStaffing {
  readonly onMission: number;
  readonly intercontrat: number;
}

export interface ManagerDashboard {
  readonly period: string;
  readonly availablePeriods: readonly string[];
  readonly role: 'manager';
  readonly pendingDecisions: number;
  readonly billableCents: number;
  readonly lateCras: number;
  /**
   * Every `submitted` Cra across every period (ADR-0082's own scope), oldest first — the work
   * queue `pendingDecisions` counts but did not, until this field, let a manager reach directly.
   */
  readonly awaitingDecision: readonly ManagerQueueRow[];
  readonly staffing: ManagerStaffing;
  readonly recentActivity: readonly DashboardActivity[];
}

/** One row of billing's "à faire maintenant" queue — a draft ready to issue. */
export interface BillingQueueRow {
  readonly invoiceId: string;
  readonly billedToName: string;
  readonly supplyPeriod: string;
  readonly totalTtcCents: number;
  /** F10: the same discriminant A7/A13 added to the invoice and pré-facturier lists — a client,
   * a month and an amount alone do not tell two drafts apart. `'—'` when the source Cra is gone. */
  readonly consultantName: string;
}

export interface BillingDashboard {
  readonly period: string;
  readonly availablePeriods: readonly string[];
  readonly role: 'billing';
  readonly draftInvoices: number;
  readonly issuedInvoices: number;
  readonly totalTtcIssuedCents: number;
  /** The ten oldest drafts across every period, oldest supply period first — not every draft
   * (F10): the full set is the invoice list's own `?status=draft` view. */
  readonly oldestDrafts: readonly BillingQueueRow[];
  readonly recentActivity: readonly DashboardActivity[];
}

export type DashboardResponse = ConsultantDashboard | ManagerDashboard | BillingDashboard;

/** `GET /api/v1/org-chart`. One org-chart neighbour. */
export interface OrgChartMember {
  readonly id: string;
  readonly displayName: string;
}

/** A consultant's own manager (N+1) — `null` when nobody is currently attached (a legacy or
 * data gap this UI has to render, not assume away). */
export interface ConsultantOrgChart {
  readonly role: 'consultant';
  readonly manager: OrgChartMember | null;
}

/** A manager's direct reports (N-1) and their own manager (N+1, "the director" in this dataset). */
export interface ManagerOrgChart {
  readonly role: 'manager';
  readonly manager: OrgChartMember | null;
  readonly reports: readonly OrgChartMember[];
}

export type OrgChartResponse = ConsultantOrgChart | ManagerOrgChart;
