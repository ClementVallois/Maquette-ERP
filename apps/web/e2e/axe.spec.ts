import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 6's axe gate ("Audit axe sur la grille : zéro violation critique/sérieuse", the exit Gate
 * of `docs/frontend-plan.md` Phase 6.5) plus the list screen it sits beside — both reachable
 * without depending on `journeys.spec.ts` having run first, so this spec stands on its own on the
 * `desktop`/`mobile-shell` projects. `2026-07` audits the **editable** grid (no seed data exists
 * for it — task 7.6 later reuses the same period for the pré-facturier's own empty state, and a
 * read-only GET here never writes anything that would collide with it); `2026-06` audits the
 * **read-only, validated** grid, the seed's real month.
 *
 * Run against a live API and a seeded database — `playwright.config.ts`'s `webServer` now starts
 * both and resets the database first.
 */

const SEVERE = new Set(['critical', 'serious']);

async function assertNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (violation) =>
      violation.impact !== null && violation.impact !== undefined && SEVERE.has(violation.impact),
  );

  expect(severe, JSON.stringify(severe, null, 2)).toHaveLength(0);
}

async function choosePersona(page: Page, personaKey: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

test.describe('accessibility — Mon CRA', () => {
  test('the month list has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra');
    await page.getByRole('columnheader', { name: 'Mois' }).waitFor({ state: 'visible' });

    await assertNoSeriousViolations(page);
  });

  test('the read-only, validated grid has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-06');
    await page.getByText('CRA validé', { exact: false }).waitFor({ state: 'visible' });

    await assertNoSeriousViolations(page);
  });

  test('the editable, empty grid has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-07');
    await page.locator('select').first().waitFor({ state: 'visible' });

    await assertNoSeriousViolations(page);
  });
});

/**
 * Phase 7's own axe gate ("Audit axe sur le pré-facturier", task 7's exit criterion). Both states
 * below are read-only GETs against the seed, robust to whether `journeys.spec.ts` has already run
 * in this invocation — `2026-06` always has at least Alice's June row, `2026-07` is a period no
 * spec in this repository ever writes to.
 */
test.describe('accessibility — Pré-facturier', () => {
  test('a period with data has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/pre-facturier?period=2026-06');
    await page.getByRole('heading', { name: 'Les CRA du mois' }).waitFor({ state: 'visible' });

    await assertNoSeriousViolations(page);
  });

  test('a period with nothing in it (2026-07, task 7.6’s empty state) has no critical/serious violation', async ({
    page,
  }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/pre-facturier?period=2026-07');
    await page
      .getByText('Aucun CRA sur ce mois dans cette implantation.')
      .waitFor({ state: 'visible' });

    await assertNoSeriousViolations(page);
  });
});

/**
 * Phase 8's own axe gate (task 8's exit criterion: "axe on list + detail + dashboard"). Every
 * screen below is read against seed rows no spec in this repository mutates: `billing-paris`'s own
 * "Banque Nationale de Test" invoice (draft, present on any fresh seed regardless of whether
 * `journeys.spec.ts` has already run) for the list and detail, and each persona's own `?period=`-
 * free dashboard, which always answers for the wall-clock month (`lib/period.ts`) — read-only, so
 * two invocations never disagree on which period that is.
 */
test.describe('accessibility — Factures', () => {
  test('the invoice list has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'billing-paris');
    await page.goto('/factures');
    await page.getByText('Banque Nationale de Test', { exact: true }).waitFor({ state: 'visible' });

    await assertNoSeriousViolations(page);
    await page.screenshot({ path: 'tests/visual/review/8.1-factures-list.png', fullPage: false });
  });

  test('an invoice detail has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'billing-paris');
    await page.goto('/factures');
    await page.getByText('Banque Nationale de Test', { exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('link', { name: 'Ouvrir la facture' }).first().click();
    await page.getByText('Émetteur').waitFor({ state: 'visible' });

    await assertNoSeriousViolations(page);
    await page.screenshot({ path: 'tests/visual/review/8.2-facture-detail.png', fullPage: true });
  });
});

test.describe('accessibility — Tableau de bord (task 8.4, three roles)', () => {
  const roles: readonly { key: string; label: string; anchor: string }[] = [
    { key: 'consultant-paris', label: 'consultant', anchor: 'Statut du mois' },
    { key: 'manager-paris', label: 'manager', anchor: 'CRA en attente de décision' },
    { key: 'billing-paris', label: 'billing', anchor: 'Factures en brouillon' },
  ];

  for (const role of roles) {
    test(`the ${role.label} dashboard has no critical/serious violation`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'one capture per role is enough here');

      await choosePersona(page, role.key);
      await page.getByText(role.anchor).waitFor({ state: 'visible' });

      await assertNoSeriousViolations(page);
      await page.screenshot({
        path: `tests/visual/review/8.4-dashboard-${role.label}.png`,
        fullPage: false,
      });
    });
  }
});
