import { describe, expect, it } from 'vitest';

import { callToAction } from './actions';
import type { BillingDashboard, ConsultantDashboard, ManagerDashboard } from './types';

const consultant = (overrides: Partial<ConsultantDashboard> = {}): ConsultantDashboard => ({
  period: '2026-06',
  role: 'consultant',
  myMonthStatus: null,
  recordedQuarterDays: 0,
  remainingWorkableDays: 21,
  ...overrides,
});

const manager = (overrides: Partial<ManagerDashboard> = {}): ManagerDashboard => ({
  period: '2026-06',
  role: 'manager',
  pendingDecisions: 0,
  billableCents: 0,
  lateCras: 0,
  ...overrides,
});

const billing = (overrides: Partial<BillingDashboard> = {}): BillingDashboard => ({
  period: '2026-06',
  role: 'billing',
  draftInvoices: 0,
  issuedInvoices: 0,
  totalTtcIssuedCents: 0,
  ...overrides,
});

describe('the dashboard call to action, per role', () => {
  it('carries the consultant to their own month, as a route param', () => {
    const { action } = callToAction(consultant({ period: '2026-08' }));

    expect(action.to).toBe('/cra/$period');
    expect(action.params).toStrictEqual({ period: '2026-08' });
  });

  it('names the consultant month’s real state, and "not started" when there is none', () => {
    expect(callToAction(consultant({ myMonthStatus: null })).sentence).toBe(
      'Ce mois n’a pas encore été commencé.',
    );
    expect(callToAction(consultant({ myMonthStatus: 'refused' })).sentence).toBe(
      'Votre mois a été refusé : une correction est attendue.',
    );
  });

  it('carries the manager to the pré-facturier, and counts in words', () => {
    expect(callToAction(manager({ pendingDecisions: 0 })).sentence).toBe(
      'Aucun CRA n’attend votre décision ce mois.',
    );
    expect(callToAction(manager({ pendingDecisions: 1 })).sentence).toBe(
      '1 CRA en attente de votre décision.',
    );
    expect(callToAction(manager({ pendingDecisions: 4 })).sentence).toBe(
      '4 CRA en attente de votre décision.',
    );
    expect(callToAction(manager()).action.to).toBe('/pre-facturier');
  });

  it('sends billing to the whole list when nothing is in draft', () => {
    const { action } = callToAction(billing({ draftInvoices: 0 }));

    expect(action.to).toBe('/factures');
    expect(action.search).toBeUndefined();
  });

  /**
   * The regression this file exists for. The billing deep link used to be written
   * `to: '/factures?status=draft'`, which TanStack Router never parses: `to` is a pathname
   * template, `buildLocation` sets `nextSearch = fromSearch`, and the whole string — question
   * mark included — is resolved as a path that matches no route. The link has to travel as
   * `search`, and the branch is only reachable when a draft exists, so nothing on a seeded screen
   * would have shown it (the seed holds `2026-06`; this screen reads the wall-clock month).
   */
  it('deep-links billing to the draft tab as a search param, never as a query string in `to`', () => {
    const { action } = callToAction(billing({ draftInvoices: 3 }));

    expect(action.to).toBe('/factures');
    expect(action.search).toStrictEqual({ status: 'draft' });
  });

  /**
   * A guard on the defect *class*, not on the one occurrence: every destination this module can
   * produce, over every branch, is a bare route template. `to` carrying a `?` or a `&` is the bug
   * above by another name, and the type system already refuses it — this asserts it at runtime
   * too, so the rule survives a future `as` or a widened prop.
   */
  it('never puts a query string in a destination, on any branch', () => {
    const everyBranch = [
      consultant({ myMonthStatus: null }),
      consultant({ myMonthStatus: 'draft' }),
      consultant({ myMonthStatus: 'submitted' }),
      consultant({ myMonthStatus: 'validated' }),
      consultant({ myMonthStatus: 'refused' }),
      manager({ pendingDecisions: 0 }),
      manager({ pendingDecisions: 1 }),
      manager({ pendingDecisions: 2 }),
      billing({ draftInvoices: 0 }),
      billing({ draftInvoices: 1 }),
      billing({ draftInvoices: 2 }),
    ];

    for (const data of everyBranch) {
      const { to } = callToAction(data).action;

      expect(typeof to).toBe('string');
      expect(to).not.toMatch(/[?&]/);
    }
  });
});
