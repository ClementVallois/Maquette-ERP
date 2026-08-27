import type { ActionLink } from '@/components/action-link';
import { LABELS } from '@/lib/labels';

import type { BillingDashboard, ConsultantDashboard, ManagerDashboard } from './types';
import type { DashboardResponse } from './types';

export interface DashboardCallToAction {
  /** One sentence naming the fact. Never a second copy of a StatCard's own figure. */
  readonly sentence: string;
  /**
   * Where the button goes, as `ActionLink` (`@/components/action-link` — its header explains why
   * a widened `to: string` is the wrong type here). Before this module existed the billing branch
   * read `to: '/factures?status=draft'`, which TanStack Router resolves as a *pathname* and
   * therefore matches against nothing: the deep link was dead, and unreachable on a seeded screen
   * besides, since it only renders when a draft invoice exists in the wall-clock month and the
   * seed holds `2026-06`.
   */
  readonly action: ActionLink;
}

function consultantCallToAction(data: ConsultantDashboard): DashboardCallToAction {
  const labels = LABELS.dashboard.consultant;
  const status = data.myMonthStatus;

  return {
    sentence: status === null ? labels.hints.none : labels.hints[status],
    action: { label: labels.open, to: '/cra/$period', params: { period: data.period } },
  };
}

function managerCallToAction(data: ManagerDashboard): DashboardCallToAction {
  const labels = LABELS.dashboard.manager;
  const sentence =
    data.pendingDecisions === 0
      ? labels.pendingSentenceNone
      : data.pendingDecisions === 1
        ? labels.pendingSentenceOne
        : labels.pendingSentenceMany.replace('{count}', String(data.pendingDecisions));

  return { sentence, action: { label: labels.open, to: '/pre-facturier' } };
}

function billingCallToAction(data: BillingDashboard): DashboardCallToAction {
  const labels = LABELS.dashboard.billing;
  const sentence =
    data.draftInvoices === 0
      ? labels.draftSentenceNone
      : data.draftInvoices === 1
        ? labels.draftSentenceOne
        : labels.draftSentenceMany.replace('{count}', String(data.draftInvoices));

  // The draft tab is a **view** the invoice list already reads off its own `?status=` search param
  // (`routes/_shell/factures.index.tsx`'s `validateSearch`), so the deep link says which view to
  // open rather than asking for a different screen.
  return {
    sentence,
    action:
      data.draftInvoices > 0
        ? { label: labels.open, to: '/factures', search: { status: 'draft' } }
        : { label: labels.open, to: '/factures' },
  };
}

/**
 * The one mapping from "what this role's month looks like" to "what to do about it". Pure, so the
 * branch that only exists when a figure is non-zero is provable without the data that produces it
 * — which matters here, because the seed holds `2026-06` and this screen always reads the
 * wall-clock month (see `docs/open-questions.md`, the Phase 8 review row of 27/08/2026).
 */
export function callToAction(data: DashboardResponse): DashboardCallToAction {
  switch (data.role) {
    case 'consultant':
      return consultantCallToAction(data);
    case 'manager':
      return managerCallToAction(data);
    case 'billing':
      return billingCallToAction(data);
  }
}
