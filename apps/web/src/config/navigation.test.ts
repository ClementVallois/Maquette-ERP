import { describe, expect, it } from 'vitest';

import { LABELS } from '@/lib/labels';

import { navigationForRole } from './navigation';

/**
 * The Gate for frontend-plan.md Phase 4 asks Playwright to prove "pour chaque persona, la nav
 * montre exactement les entrées de son rôle" — exactly, not "at least". This unit test is the
 * fast, role-by-role version of the same assertion, over the same source of truth
 * (`navigationForRole`) the Sidebar reads: it asserts both presence and **absence**, so a nav that
 * renders every entry to every role — the decorative-gate shape BUILD-RULES names — fails here
 * before it ever reaches a browser.
 */
describe('navigationForRole', () => {
  // Item 20, QA round 3: three placeholder pages (`ComingSoon`), every role, appended last —
  // every list below carries the same three trailing entries regardless of role.
  const SELF_SERVICE_LABELS = [
    LABELS.selfService.mesInformationsNav,
    LABELS.selfService.mesNotesDeFraisNav,
    LABELS.selfService.mesAbsencesNav,
  ];

  it('shows exactly the consultant entries: Tableau de bord, Mes CRA, self-service', () => {
    const labels = navigationForRole('consultant').map((entry) => entry.label);

    expect(labels).toStrictEqual([
      LABELS.dashboard.heading,
      LABELS.cra.nav,
      ...SELF_SERVICE_LABELS,
    ]);
  });

  it('shows exactly the manager entries: Tableau de bord, Pré-facturier, CRA, Affectations, Factures, self-service', () => {
    const labels = navigationForRole('manager').map((entry) => entry.label);

    expect(labels).toStrictEqual([
      LABELS.dashboard.heading,
      LABELS.preFacturier.nav,
      LABELS.cra.navManager,
      LABELS.assignment.nav,
      LABELS.invoice.nav,
      ...SELF_SERVICE_LABELS,
    ]);
  });

  it('shows exactly the billing entries: Tableau de bord, Pré-facturier, Factures, self-service', () => {
    const labels = navigationForRole('billing').map((entry) => entry.label);

    expect(labels).toStrictEqual([
      LABELS.dashboard.heading,
      LABELS.preFacturier.nav,
      LABELS.invoice.nav,
      ...SELF_SERVICE_LABELS,
    ]);
  });

  it('never shows the consultant wording of /cra to a manager, or the reverse', () => {
    expect(navigationForRole('manager').map((entry) => entry.label)).not.toContain(LABELS.cra.nav);
    expect(navigationForRole('consultant').map((entry) => entry.label)).not.toContain(
      LABELS.cra.navManager,
    );
  });

  it('never shows a standing Marge entry to any role — reached only by a click from the pré-facturier (Phase 7, task 7.5)', () => {
    expect(navigationForRole('consultant').map((entry) => entry.id)).not.toContain('marge');
    expect(navigationForRole('manager').map((entry) => entry.id)).not.toContain('marge');
    expect(navigationForRole('billing').map((entry) => entry.id)).not.toContain('marge');
  });
});
