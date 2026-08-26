import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Annexe B's e2e journeys, reworked for ADR-0070's matrix and the five things this task built.
 *
 * `test.describe.configure({ mode: 'serial' })` pins the order within this file;
 * `playwright.config.ts`'s `journeys` project (`fullyParallel: false`, `workers: 1`) is what stops
 * a second worker from picking one of these up out of turn. Order matters below: the persona-cache
 * test runs first (nothing it needs depends on anything another test writes), then J1 (which
 * creates `2026-08`'s Cra as a side effect — later tests that need a still-blank future month pick
 * whatever the "Ouvrir un autre mois" control offers rather than assuming a specific one), then the
 * manager-facing reads (ADR-0071), which are read-only and safe anywhere after the seed exists.
 *
 * Run via `pnpm --filter @erp/web exec playwright test --project=journeys` —
 * `playwright.config.ts`'s `webServer` resets the database and starts both the API and Vite;
 * nothing here starts either itself. When both are already running (the common dev loop),
 * `reuseExistingServer` skips `db:reset`, so `pnpm run seed` from the repo root first is what gets
 * a clean fixture.
 */

test.describe.configure({ mode: 'serial' });

/** The two "this fixture should exist by now" guards below, typed rather than a bare
 * `new Error()` — this repository's own rule (`no-restricted-syntax`) applies uniformly,
 * including to its own test suite. */
class FixtureAssumptionError extends Error {}

const DORA = 'Audit DORA — Banque Nationale';
const PASSI = 'Audit PASSI — Banque Nationale';
const EDIT_PERIOD = '2026-08';

const DEV_ORIGIN = 'http://127.0.0.1:5173';
const API_ORIGIN = 'http://127.0.0.1:3000';

interface GridResponseForAssertions {
  readonly craId: string | null;
  readonly status: string | null;
}

interface CraListRowForAssertions {
  readonly consultantId: string;
  readonly consultantName: string;
  readonly period: string;
}

async function fetchGrid(page: Page, period: string): Promise<GridResponseForAssertions> {
  const response = await page.request.get(`/api/v1/cras/${period}/grid`);

  return (await response.json()) as GridResponseForAssertions;
}

/**
 * A matrix cell, located by its accessible name — `${activityLabel} — ${dayLabel}` — which both
 * `CraQuantityCell` render paths carry (`aria-label` on the `<select>` when editable, on the
 * `<span>` when not). `[aria-label="…"]` rather than `getByRole('combobox', …)`/`getByText(…)`:
 * one selector that finds the cell whichever of the two it is, which is what a test spanning both
 * a read-only month and an editable one needs. `day` is `DD/MM/YYYY` (`frenchDate`'s own output).
 */
function cell(page: Page, activityLabel: string, day: string): Locator {
  return page.locator(`[aria-label="${activityLabel} — ${day}"]`);
}

async function choosePersona(page: Page, personaKey: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

/** Switches persona **without a page reload** — the exact repro path item 1's bug lived on. Both
 * hops are client-side navigation (`navigate()`, never `goto()`), same as a real visitor clicking
 * through the topbar's persona menu. */
async function switchPersonaViaUi(page: Page, personaKey: string): Promise<void> {
  await page.locator('[data-slot="dropdown-menu-trigger"]').click();
  await page.getByRole('menuitem', { name: 'Changer de persona' }).click();
  await page.waitForURL('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

/** Used only for the deep-link denial test below, which needs a persona switch behind a raw API
 * call rather than through the UI (the point of that test is the server's refusal, not the
 * client's cache) — same pattern the previous version of this file used for the manager-refusal
 * step. */
async function switchPersonaViaApi(page: Page, personaKey: string): Promise<void> {
  const response = await page.request.post('/api/v1/session/persona', {
    data: { key: personaKey },
    headers: { origin: DEV_ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

test.describe('item 1 — switching persona drops stale data without a reload', () => {
  test("a manager switched to client-side sees the whole office, not the previous persona's own rows", async ({
    page,
  }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra');
    // A consultant's own list carries no "Consultant" column (`cra-list-screen.tsx`'s own
    // role-conditional).
    await expect(page.getByRole('columnheader', { name: 'Consultant' })).toHaveCount(0);

    await switchPersonaViaUi(page, 'manager-paris');
    // Client-side, not `page.goto` — the sidebar's own "CRA" entry for a manager.
    await page.getByRole('link', { name: 'CRA', exact: true }).click();
    await page.waitForURL('/cra');

    await expect(page.getByRole('columnheader', { name: 'Consultant' })).toBeVisible();
    // Claire Dubois can only appear here if the office-wide query actually ran: Alice's own
    // cached list (the previous persona's `GET /api/v1/cras`) never contains Claire's name — a
    // stale cache would leave this screen showing only Alice's own months.
    await expect(page.getByText('Claire Dubois')).toBeVisible();
  });
});

test.describe('J1 — consultant-paris (Alice): the seed on 2026-06, then a matrix edit/save/submit', () => {
  test('the validated June matrix shows exactly what the seed says it does', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-06');

    await page.getByText('CRA validé', { exact: false }).waitFor({ state: 'visible' });
    await expect(page.getByText('Validé par Bruno Leroy', { exact: false })).toBeVisible();

    // Three activity rows: two missions that carry data, plus Absence — never one row per day.
    const table = page.getByRole('table');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByRole('rowheader', { name: DORA })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: PASSI })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Absence' })).toBeVisible();

    // 11/06 — the split day: half a day on each mission (VARIED_MONTH.splitDay).
    await expect(cell(page, DORA, '11/06/2026')).toHaveText('½');
    await expect(cell(page, PASSI, '11/06/2026')).toHaveText('½');

    // 12/06 — the quarter-proof day: three quarters and one (VARIED_MONTH.quarterProofDay), the
    // day that genuinely needs the quarter-day unit rather than merely being spelled in it.
    await expect(cell(page, DORA, '12/06/2026')).toHaveText('¾');
    await expect(cell(page, PASSI, '12/06/2026')).toHaveText('¼');

    // 18/06 — a full-day absence (VARIED_MONTH.absenceDay).
    await expect(cell(page, 'Absence', '18/06/2026')).toHaveText('1');

    // 13/06 — a worked Saturday, flagged rather than blocked (VARIED_MONTH.flaggedSaturday).
    const saturdayHeader = page.getByRole('columnheader', { name: /S 13/ });
    await expect(saturdayHeader).toContainText('Week-end');
    await expect(saturdayHeader).toContainText('Signalé');
    await expect(cell(page, DORA, '13/06/2026')).toHaveText('1');

    // Read-only: nothing on this validated month is a `<select>`.
    await expect(page.locator('select')).toHaveCount(0);

    await page.screenshot({
      path: 'tests/visual/review/6.4-cra-grid-validated.png',
      fullPage: false,
    });
  });

  test('month navigation reaches an empty, editable month, and the row tools fill it', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-06');

    // The gesture, not a `goto`: two clicks of "Mois suivant" (task 6.3's own navigation tool).
    await page.getByRole('link', { name: 'Mois suivant' }).click();
    await page.waitForURL('/cra/2026-07');
    await page.getByRole('link', { name: 'Mois suivant' }).click();
    await page.waitForURL(`/cra/${EDIT_PERIOD}`);

    // A blank month invites: only the Absence row, "ajoutez une activité", and an informational
    // banner rather than a placeholder (task 6.7's "grille vierge invitante").
    await page
      .getByText('Ce mois n’a pas encore été commencé', { exact: false })
      .waitFor({ state: 'visible' });
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
    await page.screenshot({
      path: 'tests/visual/review/6.5-cra-grid-empty-month.png',
      fullPage: false,
    });

    // Add an activity (task 6.3).
    await page.getByRole('combobox', { name: 'Ajouter une activité' }).click();
    await page.getByRole('option', { name: DORA }).click();
    await expect(page.getByRole('rowheader', { name: DORA })).toBeVisible();

    const doraRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: DORA }) });
    const doraMonthTotal = doraRow.getByRole('cell').last();
    const mondayDayTotal = page.locator('[aria-label="Total du jour — 03/08/2026"]');

    // Keyboard-focus evidence (task 6.2).
    const monday = cell(page, DORA, '03/08/2026');
    await monday.focus();
    await page.screenshot({
      path: 'tests/visual/review/6.2-cra-grid-keyboard-focus.png',
      fullPage: false,
    });

    // Defect 2 (Phase 6 revue): arrow keys move focus, never a value — a closed native <select>
    // otherwise cycles its own option on every arrow key (Left/Right no less than Up/Down),
    // changing the cell being left, or the one about to be entered. Both cells are still blank
    // here, so a value changing either way would show up as `'1'` (a full day), not `'0'`.
    const tuesday = cell(page, DORA, '04/08/2026');
    await page.keyboard.press('ArrowRight');
    await expect(tuesday).toBeFocused();
    await expect(monday).toHaveValue('0');
    await expect(tuesday).toHaveValue('0');
    await page.keyboard.press('ArrowLeft');
    await expect(monday).toBeFocused();
    await expect(monday).toHaveValue('0');
    await expect(tuesday).toHaveValue('0');

    // A quarter-day, and the day total reflects it immediately (task 6.2's own contract) — read
    // off the row's own month total, which sums the same local state the cell just changed.
    // `frenchDays(1)` (`lib/format.ts`), not the cell's own `¼` glyph — the two are different
    // display conventions for the same quantity.
    await monday.selectOption({ label: '¼' });
    await expect(doraMonthTotal).toHaveText(/0,25\s*j/u);
    await expect(mondayDayTotal).toHaveText(/0,25\s*j/u);
    await page.screenshot({ path: 'tests/visual/review/6.2-cra-grid-draft.png', fullPage: false });

    // Complete that one day (topping the quarter up to a full day), then let the row tool fill
    // every other workable day — "remplir les jours ouvrés vides" never touches a day that
    // already carries anything, which 03/08 now does.
    await monday.selectOption({ label: '1' });
    await page.getByRole('button', { name: `Remplir les jours ouvrés vides — ${DORA}` }).click();

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Enregistré', { exact: true }).waitFor({ state: 'visible' });

    // Reopen: a full page reload, not the SPA's own cache — proof the write reached the server.
    await page.reload();
    await page.getByRole('rowheader', { name: DORA }).waitFor({ state: 'visible' });
    await expect(cell(page, DORA, '03/08/2026')).toHaveValue('4');

    const reread = await fetchGrid(page, EDIT_PERIOD);
    expect(reread.status).toBe('draft');

    await page.getByRole('button', { name: 'Soumettre au manager' }).click();
    await page.getByText('Soumis', { exact: true }).waitFor({ state: 'visible' });

    await page.getByText('CRA soumis', { exact: false }).waitFor({ state: 'visible' });
    await expect(page.locator('select')).toHaveCount(0);
    await page.screenshot({
      path: 'tests/visual/review/6.4-cra-grid-submitted.png',
      fullPage: false,
    });
  });

  test('a manager refusal (via the pre-existing SSR endpoint) shows the reason, matrix re-editable', async ({
    page,
  }) => {
    // `docs/frontend-plan.md` Annexe A names no `/api/v1` refusal route yet (Phase 7 gives the
    // SPA its own) — the domain and its HTTP surface for a refusal already exist and are already
    // tested, so driving that real endpoint here is evidence from the real chain.
    await choosePersona(page, 'consultant-paris');
    const before = await fetchGrid(page, EDIT_PERIOD);
    expect(before.status).toBe('submitted');
    if (before.craId === null) {
      throw new FixtureAssumptionError('Expected the previous test to have saved a Cra.');
    }
    const craId = before.craId;

    await switchPersonaViaApi(page, 'manager-paris');
    const reason = 'Le 03/08 doit être reventilé sur un seul projet — motif de démonstration e2e.';
    const refusal = await page.request.post(`${API_ORIGIN}/pre-facturier/refus/${craId}`, {
      form: { reason, periode: EDIT_PERIOD },
      headers: { origin: DEV_ORIGIN },
      maxRedirects: 0,
    });
    expect(refusal.status()).toBe(303);

    await switchPersonaViaApi(page, 'consultant-paris');
    await page.goto(`/cra/${EDIT_PERIOD}`);

    await page.getByText('Ce CRA a été refusé par le manager', { exact: false }).waitFor({
      state: 'visible',
    });
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();

    await page.screenshot({
      path: 'tests/visual/review/6.4-cra-grid-refused.png',
      fullPage: false,
    });
  });
});

test.describe('item 2 — a consultant opens a month ahead that has no Cra yet', () => {
  test('the "Ouvrir un autre mois" picker opens a blank, editable grid', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra');

    await page
      .getByRole('combobox')
      .filter({ hasText: /Choisir un mois/ })
      .click();
    const firstOption = page.getByRole('option').first();
    const pickedLabel = await firstOption.textContent();
    await firstOption.click();
    await page.getByRole('button', { name: 'Ouvrir' }).click();

    await page.waitForURL(/\/cra\/\d{4}-\d{2}$/u);
    await page
      .getByText('Ce mois n’a pas encore été commencé', { exact: false })
      .waitFor({ state: 'visible' });
    expect(pickedLabel).not.toBeNull();

    await page.screenshot({ path: 'tests/visual/review/item2-open-another-month.png' });
  });
});

test.describe('items 4/5 — a manager sees consultants, picks one, opens a read-only CRA (ADR-0071)', () => {
  test('opening Alice’s validated June from the office list is read-only and names her', async ({
    page,
  }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/cra');

    const aliceJune = page
      .getByRole('row')
      .filter({ hasText: 'Alice Martin' })
      .filter({ hasText: 'juin 2026' });
    await aliceJune.getByRole('link', { name: 'Ouvrir' }).click();

    await page.waitForURL(/\/cra\/2026-06\/.+/u);
    await expect(
      page.getByText('Vous consultez le CRA de Alice Martin, en lecture seule.'),
    ).toBeVisible();
    await expect(page.getByText('Validé par Bruno Leroy', { exact: false })).toBeVisible();
    // Read-only: a manager never edits a consultant's CRA (ADR-0071, separation of duties).
    await expect(page.locator('select')).toHaveCount(0);
    await expect(page.getByRole('rowheader', { name: DORA })).toBeVisible();
    await expect(cell(page, DORA, '11/06/2026')).toHaveText('½');

    await page.getByRole('link', { name: 'Retour à la liste' }).click();
    await page.waitForURL('/cra');

    await page.screenshot({
      path: 'tests/visual/review/item4-5-manager-cra-view.png',
      fullPage: false,
    });
  });

  test('a manager of another office is refused, out-of-scope, on the same deep link', async ({
    page,
  }) => {
    await choosePersona(page, 'manager-paris');
    const listResponse = await page.request.get('/api/v1/cras?limit=50');
    const { cras } = (await listResponse.json()) as { cras: CraListRowForAssertions[] };
    const aliceRow = cras.find(
      (row) => row.consultantName === 'Alice Martin' && row.period === '2026-06',
    );
    if (aliceRow === undefined) {
      throw new FixtureAssumptionError('Expected Alice’s June row in the office list.');
    }

    await switchPersonaViaApi(page, 'manager-lyon');
    await page.goto(`/cra/2026-06/${aliceRow.consultantId}`);

    await page.getByText('Accès refusé', { exact: true }).waitFor({ state: 'visible' });
    await expect(page.getByText('/problems/out-of-scope')).toBeVisible();

    await page.screenshot({
      path: 'tests/visual/review/item4-5-manager-out-of-scope.png',
      fullPage: false,
    });
  });
});

test.describe('task 6.5 — a role this route cannot serve', () => {
  test('a manager on /cra/2026-06 (own-month route) gets the designed denied screen, not a crash', async ({
    page,
  }) => {
    // `GET /api/v1/cras/:period/grid` is `forRoles('consultant')` and the path carries no
    // consultant id — it is always the caller's own month, so a manager reaches
    // `insufficient-role`, never `out-of-scope` — the manager's own read of someone else's month
    // now goes through `/cra/$period/$consultantId` instead (ADR-0071, tested above).
    await choosePersona(page, 'manager-paris');
    await page.goto('/cra/2026-06');

    await page.getByText('Accès refusé', { exact: true }).waitFor({ state: 'visible' });
    await expect(page.getByText('/problems/insufficient-role')).toBeVisible();
    await expect(page.getByText('Manager', { exact: true })).toBeVisible();

    await page.screenshot({
      path: 'tests/visual/review/6.5-cra-denied-insufficient-role.png',
      fullPage: false,
    });
  });
});

test.describe('task 6.1 — the month list', () => {
  test('Mes CRA lists Alice’s months, and offers no period filter', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra');

    await expect(page.getByRole('columnheader', { name: 'Mois' })).toBeVisible();
    await expect(page.getByText('Filtrer par mois')).toHaveCount(0);

    await page.screenshot({ path: 'tests/visual/review/6.1-cra-list.png', fullPage: false });
  });
});
