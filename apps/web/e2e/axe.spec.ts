import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 6's axe gate ("Audit axe sur la grille : zéro violation critique/sérieuse", the exit Gate
 * of `docs/frontend-plan.md` Phase 6.5) plus the list screen it sits beside — both reachable
 * without depending on `journeys.spec.ts` having run first, so this spec stands on its own on the
 * `desktop`/`mobile-shell` projects, in whatever order `playwright test` (no `--project` filter,
 * CI's own invocation) happens to run them in. `2026-12` audits the **editable** grid — not
 * `2026-06`/`07`/`08` (item 6, QA round 1, densified all three for every active consultant
 * including Alice) and not `2026-09` either (the one month `DENSE_PERIODS` leaves blank on
 * purpose — item 2, QA round 2 — but `journeys.spec.ts`'s J1 fills and submits it interactively,
 * so it is only blank if that spec has not run yet — exactly the ordering dependency this file's
 * own header rules out). `2026-12` is outside `DENSE_PERIODS`,
 * outside `HISTORICAL_VETERANS`'s span, and outside every period any spec in this repository ever
 * writes to (`journeys.spec.ts`'s task 7.6 reads it, read-only, for the pré-facturier's own empty
 * state) — genuinely blank regardless of run order. `2026-06` audits the **read-only, validated**
 * grid, the seed's real month.
 *
 * Run against a live API and a seeded database — `playwright.config.ts`'s `webServer` now starts
 * both and resets the database first.
 */

const SEVERE = new Set(['critical', 'serious']);

/**
 * Both halves of ADR-0061's mechanical claim that axe-core alone cannot stand in for: severe
 * violations, **and** the absolute "no element carries a `title` attribute" rule axe-core has no
 * rule for (a `title` is not a WCAG violation in general — it is *this repository's own* stricter
 * choice, "not exposed on touch, not focusable, not announced consistently"). Folded into one
 * function rather than left as a second call site every test would have to remember to add: five
 * real instances (three icon-button tooltips in `cra-grid-screen.tsx`, one matrix cell in
 * `cra-matrix-table.tsx`, one invoice line in `invoice-detail-screen.tsx`) shipped and went
 * unnoticed for exactly that reason — nothing checked for it once the SSR pages that used to
 * (`pre-facturier.int.test.ts`) were deleted in Phase 9, and every one of this file's existing
 * calls stayed green with a real regression already live. Verified by reintroducing one by hand
 * (`title="x"` on the margin screen's mission cell) before this fix: `assertNoSeriousViolations`'s
 * old, axe-only body stayed green against it.
 */
async function assertAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (violation) =>
      violation.impact !== null && violation.impact !== undefined && SEVERE.has(violation.impact),
  );
  expect(severe, JSON.stringify(severe, null, 2)).toHaveLength(0);

  await expect(page.locator('[title]')).toHaveCount(0);
}

async function choosePersona(page: Page, personaKey: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

/** Same shape as `journeys.spec.ts`'s own guard: a bare `new Error()` is forbidden repo-wide. */
class FixtureAssumptionError extends Error {}

test.describe('accessibility — Mon CRA', () => {
  test('the month list has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra');
    await page.getByRole('columnheader', { name: 'Mois' }).waitFor({ state: 'visible' });

    await assertAccessible(page);
  });

  test('the read-only, validated grid has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-06');
    // `getByText('CRA validé', { exact: false })` used to match both the timeline's status entry
    // (labels.ts's `timeline.validated`) and the immutability banner's own sentence ("...et un CRA
    // validé est immuable."), which shares the substring. Scope to the timeline's `listitem` role:
    // the banner lives in an `Alert`, not a list, so this is unambiguous without narrowing to
    // `exact: true` (which would still not separate the two — both render the bare phrase).
    // Item 30 (QA round 3) made `BusinessTimeline` render two trees at once (a horizontal one
    // from `sm` up, a vertical fallback below it, `sm:hidden`/`hidden sm:flex`) — unlike
    // `cra-grid-screen.tsx`'s own multi-mounted matrix, this stays a single `getByRole` match:
    // `display:none` (what `hidden` resolves to) removes an element from the accessibility tree
    // by definition, so `getByRole` already excludes the off-breakpoint tree without help.
    await page
      .getByRole('listitem')
      .filter({ hasText: 'CRA validé' })
      .waitFor({ state: 'visible' });

    await assertAccessible(page);
  });

  test('the editable, empty grid has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-12');
    await page.locator('select:visible').first().waitFor({ state: 'visible' });

    await assertAccessible(page);
  });
});

/**
 * Item 7 (QA round 1)'s own filters, on the manager's month list — every other "Mon CRA" test
 * above uses `consultant-paris`, which never renders `CraListFilters`, so a manager's `/cra` had
 * no axe coverage at all before this block. The popover's option list only exists in the DOM while
 * open (`Popover`'s own behaviour), so a violation confined to it — the `role="listbox"` without
 * `role="option"` children this filter shipped with, before it was corrected — would not be caught
 * by auditing the closed page alone; both states are asserted here for that reason.
 */
test.describe('accessibility — Mon CRA (manager, item 7 filters)', () => {
  test('the filter controls, closed, have no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/cra');
    await page.getByRole('button', { name: 'Consultants' }).waitFor({ state: 'visible' });

    await assertAccessible(page);
  });

  test('the consultant picker, open, has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/cra');
    await page.getByRole('button', { name: 'Consultants' }).click();
    await page.getByPlaceholder('Rechercher un consultant…').waitFor({ state: 'visible' });

    await assertAccessible(page);
  });
});

/**
 * Phase 7's own axe gate ("Audit axe sur le pré-facturier", task 7's exit criterion). Both states
 * below are read-only GETs against the seed, robust to whether `journeys.spec.ts` has already run
 * in this invocation — `2026-06` always has at least Alice's June row. `2026-12` (not `2026-07`
 * since item 6, QA round 1: the seed's dense months now cover 2026-06/07/08 for every office) is
 * a period no spec in this repository, and no seed period, ever writes to.
 */
test.describe('accessibility — Pré-facturier', () => {
  test('a period with data has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/pre-facturier?period=2026-06');
    await page.getByRole('heading', { name: 'Les CRA du mois' }).waitFor({ state: 'visible' });

    await assertAccessible(page);
  });

  test('a period with nothing in it (2026-12, task 7.6’s empty state) has no critical/serious violation', async ({
    page,
  }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/pre-facturier?period=2026-12');
    await page
      .getByText('Aucun CRA sur ce mois dans cette implantation.')
      .waitFor({ state: 'visible' });

    await assertAccessible(page);
  });
});

/**
 * Phase 8's own axe gate (task 8's exit criterion: "axe on list + detail + dashboard"). Every
 * screen below is read against seed rows no spec in this repository mutates: `billing-paris`'s own
 * "Banque Nationale de Test" invoices (draft, present on any fresh seed regardless of whether
 * `journeys.spec.ts` has already run) for the list and detail, and each persona's own `?period=`-
 * free dashboard, which always answers for the wall-clock month (`lib/period.ts`) — read-only, so
 * two invocations never disagree on which period that is. `.first()`: item 6 (QA round 1) staffs
 * several new roster consultants on the same client, so more than one row can carry this exact
 * name — this only needs "the list has loaded", not "there is exactly one".
 */
test.describe('accessibility — Factures', () => {
  test('the invoice list has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'billing-paris');
    await page.goto('/factures');
    await page
      .getByText('Banque Nationale de Test', { exact: true })
      .first()
      .waitFor({ state: 'visible' });

    await assertAccessible(page);
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/8.1-factures-list.png',
      fullPage: false,
    });
  });

  test('an invoice detail has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'billing-paris');
    await page.goto('/factures');
    await page
      .getByText('Banque Nationale de Test', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    await page.getByRole('link', { name: 'Ouvrir la facture' }).first().click();
    await page.getByText('Émetteur').waitFor({ state: 'visible' });

    await assertAccessible(page);
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/8.2-facture-detail.png',
      fullPage: true,
    });
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
      // `.first()`: item 6 (QA round 1) can put the billing dashboard's draft-invoice count at 2
      // or more on a fresh seed, and `labels.ts`'s `draftSentenceMany` then contains this
      // anchor's own text as a case-insensitive substring — see `shell.spec.ts`'s identical fix.
      await page.getByText(role.anchor).first().waitFor({ state: 'visible' });

      await assertAccessible(page);
      await page.screenshot({
        animations: 'disabled',
        path: `tests/visual/review/8.4-dashboard-${role.label}.png`,
        fullPage: false,
      });
    });
  }
});

/**
 * Task 10.2's own list of screens: "sélecteur" is the one that never appears in `axe.spec.ts`
 * elsewhere, because every other test starts past it (`choosePersona`'s first act is landing on
 * it, but no test has asserted the screen itself against axe before this one).
 */
test.describe('accessibility — Sélecteur de persona', () => {
  test('the persona selector has no critical/serious violation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: 'Choisir un persona' }).waitFor({ state: 'visible' });

    await assertAccessible(page);
  });

  test('the selector with the session-invalidated notice has no critical/serious violation', async ({
    page,
  }) => {
    await page.goto('/?session=invalidated');
    await page
      .getByText('Votre persona n’est plus reconnue', { exact: false })
      .waitFor({ state: 'visible' });

    await assertAccessible(page);
  });
});

/**
 * `docs/open-questions.md`, row dated 27/08/2026: ADR-0061 states its two accessibility claims
 * (scoped headers, no `title` attribute) universally, and Phase 9 deleted the two server-rendered
 * screens that used to carry the margin table's own mechanical gate. This is the one test that
 * replaces it, on the same pattern as the pré-facturier's two above.
 *
 * Deep-linked directly (`manager-paris` → Alice's own June economics) rather than reached by
 * clicking off a pré-facturier row, the way `journeys.spec.ts` does it: this file's other tests
 * are read-only and order-independent across the parallel `desktop`/`mobile-shell` projects, and a
 * deep link keeps this one the same. Alice's June Cra is `validated` and no spec in this
 * repository mutates it, unlike Claire's (whose economics only become interesting after
 * `journeys.spec.ts`'s J2 validates her) — so this test never races that one for the same row.
 */
test.describe('accessibility — Marge', () => {
  test('the margin screen has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'manager-paris');
    const listResponse = await page.request.get('/api/v1/cras?limit=50');
    const { cras } = (await listResponse.json()) as {
      cras: { consultantId: string; consultantName: string; period: string }[];
    };
    const aliceRow = cras.find(
      (row) => row.consultantName === 'Alice Martin' && row.period === '2026-06',
    );
    if (aliceRow === undefined) {
      throw new FixtureAssumptionError('Expected Alice’s June row in the office list.');
    }

    await page.goto(`/marge/${aliceRow.consultantId}?period=${aliceRow.period}`);
    await page.getByRole('heading', { name: 'Alice Martin' }).waitFor({ state: 'visible' });

    await assertAccessible(page);
  });
});

/**
 * Task 10.2's "états 403/404" — the two refusal shapes `lib/problems.ts` renders
 * (`out-of-scope`, the record exists and this actor's office may not see it; `insufficient-role`,
 * this actor's role may never call the route at all) plus the router's own not-found screen.
 * Every deep link below is the same one `journeys.spec.ts` already proves is *correct*
 * (J5, J6, task 6.5) — this file adds the axe pass those journeys never run.
 */
test.describe('accessibility — États 403/404', () => {
  test('out-of-scope (a manager of another office, denied) has no critical/serious violation', async ({
    page,
  }) => {
    await choosePersona(page, 'manager-paris');
    const listResponse = await page.request.get('/api/v1/cras?limit=50');
    const { cras } = (await listResponse.json()) as {
      cras: { consultantId: string; consultantName: string; period: string }[];
    };
    const aliceRow = cras.find(
      (row) => row.consultantName === 'Alice Martin' && row.period === '2026-06',
    );
    if (aliceRow === undefined) {
      throw new FixtureAssumptionError('Expected Alice’s June row in the office list.');
    }

    await choosePersona(page, 'manager-lyon');
    await page.goto(`/cra/2026-06/${aliceRow.consultantId}`);
    await page.getByText('Accès refusé', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('/problems/out-of-scope').waitFor({ state: 'visible' });

    await assertAccessible(page);
  });

  test('insufficient-role (billing on a margin URL, denied) has no critical/serious violation', async ({
    page,
  }) => {
    await choosePersona(page, 'billing-paris');
    const listResponse = await page.request.get('/api/v1/cras?limit=50');
    const { cras } = (await listResponse.json()) as { cras: { consultantId: string }[] };
    const anyRow = cras[0];
    if (anyRow === undefined) {
      throw new FixtureAssumptionError(
        'Expected at least one Cra in the seed for billing to read.',
      );
    }

    await page.goto(`/marge/${anyRow.consultantId}?period=2026-06`);
    await page.getByText('Accès refusé', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('/problems/insufficient-role').waitFor({ state: 'visible' });

    await assertAccessible(page);
  });

  test('the styled 404 (no matching route) has no critical/serious violation', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cette-route-n-existe-pas');
    await page.getByRole('heading', { name: 'Page introuvable' }).waitFor({ state: 'visible' });

    await assertAccessible(page);
  });
});
