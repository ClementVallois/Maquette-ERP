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

const API_ORIGIN = 'http://127.0.0.1:3000';

/**
 * The `Origin` a state-changing request has to carry, which is the **browser's** origin and not a
 * fixed port: 5173 in the dev topology (Vite), 3000 in the served build (front-end plan Phase 9.6,
 * where the API serves `dist` and there is one origin). `API_PUBLIC_ORIGIN` follows the same value
 * on the server side, so a hard-coded 5173 here answers 403 `/problems/forbidden-origin` against
 * the served build — which is how this was found, running `journeys` in that topology for the
 * first time.
 *
 * Read off the config rather than off a second env check, so this function and `baseURL` cannot
 * disagree. `shell.spec.ts` already derives its own origin from `baseURL` the same way.
 */
function browserOrigin(): string {
  const baseURL = test.info().project.use.baseURL;
  if (baseURL === undefined) {
    throw new FixtureAssumptionError('playwright.config.ts always sets a baseURL.');
  }

  return new URL(baseURL).origin;
}

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

/**
 * A `StatCard`'s value span, located via its own label span's exact text, then the next sibling
 * span `StatCard` renders it as (`components/stat-card.tsx` — one `<div>`, two `<span>` children
 * in a fixed order, no `data-testid` to hook). `following-sibling::span[1]`, not the parent
 * `<div>`: the parent's own text is the concatenation of both spans ("CJM200,00 €"), which
 * `toHaveText` compares whole, so scoping to the parent asserts the label and the value at once
 * rather than the value alone — this needs only the value. Scoping starts from the *label*'s exact
 * text (not `getByText(value)`) so a label that also appears as a table column header
 * (`Chiffre d’affaires`/`Coût`/`Marge` all repeat as `MISSION_COLUMNS` headers on the same screen)
 * still resolves to the one `StatCard` and nothing else.
 */
function statCardValue(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::span[1]');
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
    headers: { origin: browserOrigin() },
  });
  expect(response.ok()).toBe(true);
}

test.describe('demo checklist — the opening beat: the selector, notice visible', () => {
  test('the API’s own not-authentication notice renders on the first screen', async ({ page }) => {
    await page.goto('/');
    await page
      .getByText('n’a pas d’authentification', { exact: false })
      .waitFor({ state: 'visible' });
  });
});

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
    // `.first()`: item 6 (QA round 1) gives Claire a dense June/July/August, so her name is on
    // more than one row from the very first fresh seed — this check only needs "she is listed at
    // all", the same reasoning item 7's own check below gives for Alice.
    await expect(page.getByText('Claire Dubois').first()).toBeVisible();
  });
});

/**
 * QA round 1, item 2: clicking a persona used to briefly re-render the selector's own loading
 * skeleton before the destination screen appeared, because `useSelectPersona`'s `onSuccess` called
 * `queryClient.clear()` — wiping the still-mounted personas/session queries back to `isPending` for
 * the frame before `navigate()` took over. The fix (`features/session/hooks.ts`) switched to an
 * unfiltered `invalidateQueries()`, which marks every query stale without deleting the data an
 * observer already has, so nothing still on screen drops to its skeleton.
 *
 * A `MutationObserver` registered before the click is what makes this deterministic rather than a
 * race: it cannot miss a synchronous flash the way a single post-click `expect(...).not.toBeVisible()`
 * could, and it does not depend on how fast localhost happens to respond. `page.route` on the
 * personas endpoint adds a delay on top, purely so a human reading a failing run sees an obvious
 * repro rather than a one-frame blip.
 */
test.describe('item 2 — no skeleton flash between choosing a persona and landing on its home', () => {
  test('the selector never falls back to its own loading skeleton once a persona is chosen', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-persona-key="consultant-paris"] button').waitFor({
      state: 'visible',
    });

    await page.route('**/api/v1/personas', async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
      await route.continue();
    });

    await page.evaluate(() => {
      const flag = { seen: false };
      const observer = new MutationObserver(() => {
        if (document.querySelector('ul[aria-hidden="true"]') !== null) flag.seen = true;
      });
      observer.observe(document.body, { childList: true, subtree: true });
      Reflect.set(window, '__skeletonFlash', flag);
    });

    await page.locator('[data-persona-key="consultant-paris"] button').click();
    await page.waitForURL('/tableau-de-bord');

    const skeletonFlashed = await page.evaluate(
      () => Reflect.get(window, '__skeletonFlash') as { seen: boolean } | undefined,
    );
    expect(skeletonFlashed?.seen).toBe(false);
  });

  /**
   * The sibling risk `invalidateQueries()` alone would have reintroduced: none of this SPA's query
   * keys carry a persona/role/office component (`['dashboard', period]`, `['cra', 'list']`), and
   * `invalidateQueries()`'s default `refetchType: 'active'` only refetches queries a component is
   * currently subscribed to — an **inactive** cache entry (the consultant dashboard, left behind
   * when this test navigates away from it) is marked stale but keeps its data. Left alone, the
   * manager's `/tableau-de-bord` would remount that same query key, find `isPending: false`, and
   * paint the *previous* persona's cards before the background refetch replaced them — worse than
   * a skeleton, in an app whose whole point is authorization by role and scope. The fix
   * (`invalidateOnPersonaChange` in `features/session/hooks.ts`) also calls
   * `removeQueries({ type: 'inactive' })`, so a remount has nothing stale to paint.
   */
  test('the destination never paints the previous persona’s dashboard before its own', async ({
    page,
  }) => {
    await choosePersona(page, 'consultant-paris');
    // Alice's own card, "Statut du mois" — `LABELS.dashboard.consultant.monthStatus` — which the
    // manager's dashboard (`ManagerCards`) never renders.
    await expect(page.getByText('Statut du mois')).toBeVisible();

    // Widens the window in which stale cached data, if any survived, would be visible before the
    // real fetch replaces it — same purpose as the `personas` delay in the sibling test above.
    await page.route('**/api/v1/dashboard*', async (route) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 300);
      });
      await route.continue();
    });

    await page.locator('[data-slot="dropdown-menu-trigger"]').click();
    await page.getByRole('menuitem', { name: 'Changer de persona' }).click();
    await page.waitForURL('/');

    await page.evaluate(() => {
      const flag = { seen: false };
      const observer = new MutationObserver(() => {
        if (document.body.textContent.includes('Statut du mois')) flag.seen = true;
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      Reflect.set(window, '__stalePersonaFlash', flag);
    });

    await page.locator('[data-persona-key="manager-paris"] button').click();
    await page.waitForURL('/tableau-de-bord');
    // Bruno's own card, `LABELS.dashboard.manager.pending` — proves the right data landed, not
    // only that the wrong data never did.
    await expect(page.getByText('CRA en attente de décision')).toBeVisible();

    const staleFlashed = await page.evaluate(
      () => Reflect.get(window, '__stalePersonaFlash') as { seen: boolean } | undefined,
    );
    expect(staleFlashed?.seen).toBe(false);
  });
});

/**
 * QA round 1, item 3: a manager used to have to leave the pré-facturier through the CRA menu
 * (`cra-list-screen.tsx`'s own link, covered separately by "items 4/5" below) to open a row and
 * decide it. `pre-facturier-screen.tsx`'s `craColumns` now offers "Ouvrir" on every manager row,
 * and `manager-cra-grid-screen.tsx` now offers Valider/Refuser on a decidable one, reusing the same
 * dialogs the pré-facturier table itself uses (moved to `features/cra/components/` so `features/cra`
 * does not import from `features/pre-facturier` — see `refuse-dialog.tsx`'s header).
 *
 * 2026-09 rather than the seed's own June or J1's own August: both are claimed by other tests in
 * this file by the time it finishes, and this test needs a Cra nothing else decides first. Filled
 * the fast way (one day, then "Remplir les jours ouvrés vides") — the fill mechanism itself is
 * `J1`'s own test's job, not this one's.
 */
test.describe('item 3 — a manager opens and decides a CRA from the pré-facturier', () => {
  test('the pré-facturier’s “Ouvrir” link reaches the CRA, and validating from there lands back on the pré-facturier', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const period = '2026-09';

    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-06');
    await page.getByRole('link', { name: 'Mois suivant' }).click();
    await page.waitForURL('/cra/2026-07');
    await page.getByRole('link', { name: 'Mois suivant' }).click();
    await page.waitForURL('/cra/2026-08');
    await page.getByRole('link', { name: 'Mois suivant' }).click();
    await page.waitForURL(`/cra/${period}`);

    await page.getByRole('combobox', { name: 'Ajouter une activité' }).click();
    await page.getByRole('option', { name: DORA }).click();
    await expect(page.getByRole('rowheader', { name: DORA })).toBeVisible();

    const doraRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: DORA }) });
    await doraRow.locator('select').first().selectOption({ label: '1' });
    await page.getByRole('button', { name: `Remplir les jours ouvrés vides — ${DORA}` }).click();

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Enregistré', { exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Soumettre au manager' }).click();
    await page.getByText('Soumis', { exact: true }).waitFor({ state: 'visible' });

    await switchPersonaViaUi(page, 'manager-paris');
    await page.goto(`/pre-facturier?period=${period}`);
    await page.getByRole('heading', { name: 'Les CRA du mois' }).waitFor({ state: 'visible' });

    const aliceRow = page.getByRole('row').filter({ hasText: 'Alice Martin' });
    await aliceRow.getByRole('link', { name: 'Ouvrir' }).click();
    await page.waitForURL(new RegExp(`/cra/${period}/.+`));

    await page
      .getByText('Vous consultez le CRA de Alice Martin', { exact: false })
      .waitFor({ state: 'visible' });
    const validateButton = page.getByRole('button', { name: 'Valider' });
    await expect(validateButton).toBeVisible();
    await validateButton.click();

    const validateDialog = page.getByRole('dialog');
    await validateDialog.getByText('Validation du CRA de Alice Martin').waitFor({
      state: 'visible',
    });
    await validateDialog.getByRole('button', { name: 'Fermer' }).last().click();

    // "Land back somewhere sensible after validating" — the brief's own words.
    await page.waitForURL(new RegExp(`/pre-facturier\\?period=${period}`));
    await expect(aliceRow.getByRole('button', { name: 'Valider' })).toHaveCount(0);
    await expect(aliceRow.getByRole('link', { name: 'Ouvrir' })).toBeVisible();
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
      animations: 'disabled',
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
      animations: 'disabled',
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
    // A prefix match, not an exact one: a day total out of range appends the reason to its own
    // accessible name (`TOTAL_TONES[…].sentence`, `cra-matrix-table.tsx`) so a screen reader hears
    // *why* the figure is flagged, and ¼ of a day makes this very cell incomplete two steps below.
    const mondayDayTotal = page.locator('[aria-label^="Total du jour — 03/08/2026"]');

    // Keyboard-focus evidence (task 6.2).
    const monday = cell(page, DORA, '03/08/2026');
    await monday.focus();
    await page.screenshot({
      animations: 'disabled',
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
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/6.2-cra-grid-draft.png',
      fullPage: false,
    });

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
      animations: 'disabled',
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
      headers: { origin: browserOrigin() },
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
      animations: 'disabled',
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

    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/item2-open-another-month.png',
    });
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
      animations: 'disabled',
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
      animations: 'disabled',
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
    // Scoped to `DeniedState`'s own `<dl>`, not the whole page: since item 4 (QA round 1) gave
    // every role a coloured `RoleBadge`, the topbar's own identity block (`PersonaBlock`) reads
    // "Manager" too, and an unscoped `getByText` now matches both.
    await expect(page.locator('dl').getByText('Manager', { exact: true })).toBeVisible();

    await page.screenshot({
      animations: 'disabled',
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

    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/6.1-cra-list.png',
      fullPage: false,
    });
  });
});

/**
 * Item 7 (QA round 1): the manager's own `/cra` filters, non-exclusive on both dimensions and
 * ANDed with each other — the brief's own example, "for these three consultants, every CRA not
 * yet validated". Read-only throughout (no validate/refuse/save here): this test runs before J2
 * below decides anything, and must leave Claire's June exactly as it found it — "submitted",
 * still the one pending row J2 depends on.
 */
test.describe('item 7 — consultant and status filters on the manager’s CRA list', () => {
  test('both filters narrow, together, and the state survives a reload via the URL', async ({
    page,
  }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/cra');

    // `.first()`: item 6 (QA round 1) gives both Alice and Claire a dense June/July (Alice's
    // August stays withheld, `DENSE_PERIOD_EXCLUSIONS`) — Alice also carries more than one row by
    // this later point in the file (item 3, run earlier, left her a validated September on top of
    // that) — this check only needs "she/she is listed at all", not "exactly once".
    await expect(page.getByText('Alice Martin').first()).toBeVisible();
    await expect(page.getByText('Claire Dubois').first()).toBeVisible();

    // Consultant filter: search narrows the option list, a checkbox selects — Alice drops out,
    // Claire stays.
    await page.getByRole('button', { name: 'Consultants' }).click();
    await page.getByPlaceholder('Rechercher un consultant…').fill('Claire');
    // Scoped to the popover, not `role="listbox"`: the option list is a checkbox group (a plain
    // `<ul>`, no ARIA role), not a listbox — see `multi-select-combobox.tsx`'s own comment on why.
    await page.locator('[data-slot="popover-content"]').getByText('Claire Dubois').click();
    await page.keyboard.press('Escape');

    // Three rows, not one: item 6 gives Claire a dense June (submitted), July and August (both
    // validated), and the consultant filter alone — no status filter yet — narrows to *her*, not
    // to one of her months.
    await expect(page.getByText('Claire Dubois').first()).toBeVisible();
    await expect(page.getByText('Alice Martin')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ouvrir' })).toHaveCount(3);

    // The URL carries the filter — a reload must show exactly this, not a blank slate.
    await page.reload();
    await expect(page.getByText('Claire Dubois').first()).toBeVisible();
    await expect(page.getByText('Alice Martin')).toHaveCount(0);

    // Status pill, ANDed with the consultant filter already active. 'Refusé' rather than 'Validé'
    // (this test's own shape before item 6): Claire now carries a validated July and August on
    // top of her submitted June, so 'Validé' alone no longer empties her out — nothing in this
    // dataset is refused yet at this point in the file (J3, later, is the first to refuse
    // anything), which is what makes 'Refusé' the genuinely empty pill instead.
    await page.getByRole('button', { name: 'Refusé', exact: true }).click();
    await page
      .getByText('Aucun CRA ne correspond à ces filtres', { exact: false })
      .waitFor({ state: 'visible' });

    // Switching to 'Soumis' (submitted) brings her back to exactly one row — her June, the only
    // submitted Cra in the whole office at this point — proving the status pill is read live, not
    // only that "some filter" suppresses every row.
    await page.getByRole('button', { name: 'Refusé', exact: true }).click();
    await page.getByRole('button', { name: 'Soumis', exact: true }).click();
    await expect(page.getByText('Claire Dubois')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ouvrir' })).toHaveCount(1);

    // "Effacer les filtres" (inside the still-open-from-the-status-click combobox is closed by
    // now — reopen it) clears the consultant side only; the status pill is its own control and
    // stays pressed.
    await page.getByRole('button', { name: 'Consultants' }).click();
    await page.getByRole('button', { name: 'Effacer les filtres' }).click();
    await page.keyboard.press('Escape');

    await expect(page.getByText('Alice Martin')).toHaveCount(0); // Alice's June is validated
    await expect(page.getByText('Claire Dubois')).toBeVisible();

    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/item7-cra-list-filters.png',
      fullPage: false,
    });
  });
});

/**
 * Phase 7's own journeys (Annexe B, "Phase" column = 7). Placed after every Phase 6 test rather
 * than interleaved: `test.describe.configure({ mode: 'serial' })` at the top of this file orders
 * every describe block in the file, not only the ones inside a given block, so appending here is
 * what actually runs these last — after J1 has left `2026-08` in the state J3 below needs.
 *
 * J5 is not repeated as its own block: "items 4/5" above (`a manager of another office is
 * refused, out-of-scope, on the same deep link`) already deep-links `manager-lyon` into a Paris
 * Cra and asserts the designed `out-of-scope` refusal — the exact shape Annexe B's J5 names, one
 * office and one persona earlier than Phase 7 existed to give it a number. Duplicating it here
 * would be the "test that proves nothing new" `CLAUDE.md`/BUILD-RULES both warn against; that
 * test and its screenshot (`item4-5-manager-out-of-scope.png`) are J5's evidence.
 */

/** `frenchEuros`'s own formatting (`src/lib/format.ts`), reproduced rather than imported — this
 * spec runs under Playwright's own TS pipeline, not Vite, and every other exact assertion in this
 * file already re-states a small piece of app knowledge locally (`DORA`/`PASSI` above) rather than
 * reaching into `src/` for it. A narrow no-break space groups thousands and a plain no-break
 * space sits before "€" — `format.ts`'s own two constants, reproduced here as the literal
 * characters they are: an ordinary space would build a string that reads the same in this
 * file's source but never matches what the page actually renders. */
function euro(cents: number): string {
  const NARROW_NBSP = ' ';
  const NBSP = ' ';
  const digits = String(Math.abs(cents)).padStart(3, '0');
  const eurosPart = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/gu, NARROW_NBSP);
  const centimes = digits.slice(-2);

  return `${cents < 0 ? '−' : ''}${eurosPart},${centimes}${NBSP}€`;
}

test.describe('J2 — manager-paris (Bruno): validates Claire’s submitted June, drafts the Réunion invoice', () => {
  test('validating drafts exactly one invoice, addressed to the Réunion client, nothing declined — then the margin behind that same row', async ({
    page,
  }) => {
    await choosePersona(page, 'manager-paris');

    // The demo checklist's own opening beat for Bruno ("dashboard « en attente »"):
    // `docs/open-questions.md`'s row of 27/08/2026 found this screen answering empty on any date
    // after June 2026, because it read the wall-clock month against a seed frozen at `2026-06` —
    // `?period=` (this same commit) is the fix, pinning the read to the seed's own period rather
    // than depending on the day this suite happens to run. Claire's June Cra is still `submitted`
    // at this point in the file (task 6.1's list, run earlier, only reads — it never decides
    // anything), so this is the one real "pending" row the whole seed has.
    await page.goto('/tableau-de-bord?period=2026-06');
    await expect(statCardValue(page, 'CRA en attente de décision')).toHaveText('1');
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/10.4-dashboard-manager-en-attente.png',
      fullPage: false,
    });

    // Explicit period: Bruno's own `/pre-facturier` (no `period`) defaults to the office's most
    // recent Cra period, which J1 (run earlier in this file) may have pushed to `2026-08` by now
    // — this journey is about the seed's June data specifically, so it never relies on that
    // default.
    await page.goto('/pre-facturier?period=2026-06');
    await page.getByRole('heading', { name: 'Les CRA du mois' }).waitFor({ state: 'visible' });

    const claireRow = page.getByRole('row').filter({ hasText: 'Claire Dubois' });
    await claireRow.getByRole('button', { name: 'Valider' }).click();

    const validateDialog = page.getByRole('dialog');
    await validateDialog.getByText('Validation du CRA de Claire Dubois').waitFor({
      state: 'visible',
    });
    // The seed's own Réunion mission (Annexe A: "TVA 8,5 %") is what makes this exact assertion
    // possible — one draft invoice, addressed to that client, nothing declined.
    await expect(validateDialog.getByText('Réunion Cyber Services')).toBeVisible();
    await expect(validateDialog.getByText('Aucun jour écarté', { exact: false })).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/7.2-validate-result-dialog.png',
      fullPage: false,
    });

    // Two "Fermer" buttons share this dialog: `DialogContent`'s own top-right close icon (an
    // `sr-only` label, `LABELS.action.close`) and the footer button `validate-result-dialog.tsx`
    // renders — `.last()` is the footer one, DOM order putting the icon first.
    await validateDialog.getByRole('button', { name: 'Fermer' }).last().click();
    await expect(validateDialog).toBeHidden();

    // The row is now decided: Alice's June was already `validated` before this test touched
    // anything, and Claire's just joined her — so nothing on this period is `decidable` any more.
    await expect(page.getByRole('button', { name: 'Valider' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refuser' })).toHaveCount(0);
    await expect(page.getByText('Réunion Cyber Services')).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/7.1-pre-facturier.png',
      fullPage: false,
    });

    // Task 7.5's own "navigation explicite depuis une ligne du pré-facturier" — one click, off
    // Claire's row, never a hover (ADR-0052).
    await claireRow.getByRole('link', { name: 'Marge de Claire Dubois' }).click();
    await page.waitForURL(/\/marge\/.+/u);

    await page.getByRole('heading', { name: 'Claire Dubois' }).waitFor({ state: 'visible' });
    await expect(statCardValue(page, 'CJM')).toHaveText(euro(20000));

    // Revenue/cost/margin each render twice on this screen: the single mission's own row
    // (`marge-screen.tsx`'s `MISSION_COLUMNS`, reading `data.missions[0]`) and the total StatCard
    // above it (reading `data.revenueCents`/`costCents`/`marginCents`, the server's own separate
    // aggregate) — two different fields on the wire that only look like the same number because
    // this consultant has one mission. Asserting only one of the two (`.first()`, the previous
    // shape of this test) would pass even if the aggregate disagreed with the row it is supposed
    // to total — exactly the defect a totals figure exists to catch. Both are asserted here,
    // scoped to where each actually renders, so a real mismatch fails the test.
    const missionRow = page.getByRole('row').filter({ hasText: 'SOC Réunion Cyber' });
    const missionCells = missionRow.getByRole('cell');
    await expect(missionCells.nth(2)).toHaveText(euro(70000)); // Tjm
    await expect(missionCells.nth(3)).toHaveText(euro(1540000)); // revenue
    await expect(missionCells.nth(4)).toHaveText(euro(440000)); // cost
    await expect(missionCells.nth(5)).toHaveText(euro(1100000)); // margin

    await expect(statCardValue(page, 'Chiffre d’affaires')).toHaveText(euro(1540000));
    await expect(statCardValue(page, 'Coût')).toHaveText(euro(440000));
    await expect(statCardValue(page, 'Marge')).toHaveText(euro(1100000));
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/7.5-marge.png',
      fullPage: false,
    });

    await page.getByRole('link', { name: 'Revenir au pré-facturier' }).click();
    await page.waitForURL(/\/pre-facturier/u);
  });
});

test.describe('J4 — billing-paris (Henri): issues the draft J2 created, with a key, then proves the replay', () => {
  test('issuing allocates a SEC-2026 number through the dialog, and the same key replays it at the API', async ({
    page,
  }) => {
    // Runs after J2 in this file's declared order (`test.describe.configure({ mode: 'serial' })`
    // at the top orders every describe block, not only what is inside one) — J2 leaves Claire's
    // June Réunion invoice draft and unissued (its own dialog closed without an issuance, and the
    // marge visit afterwards is a read). That is the invoice this test consumes.
    //
    // Filtered on the period too, not only the client: item 6 (QA round 1) gives Claire a dense
    // July and August as well, both already validated at seed time and each drafting its own
    // Réunion invoice — three draft rows share this client's name by the time this test runs, and
    // "juin 2026" is what picks out the one J2 actually decided.
    await choosePersona(page, 'billing-paris');
    await page.goto('/factures');

    const reunionRow = page
      .getByRole('row')
      .filter({ hasText: 'Réunion Cyber Services' })
      .filter({ hasText: 'juin 2026' });
    await reunionRow.waitFor({ state: 'visible' });
    await reunionRow.getByRole('link', { name: 'Ouvrir la facture' }).click();
    await page.waitForURL(/\/factures\/.+/u);

    await page.getByRole('button', { name: 'Émettre la facture' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByText('Émettre la facture de Réunion Cyber Services')
      .waitFor({ state: 'visible' });

    // The same key the confirm click is about to send — read off the DOM before confirming, the
    // only way this test can reuse it afterwards: `IssuanceDialog` generates it once per open
    // (`useState`'s initializer) and never exposes it any other way.
    const idempotencyKey = await dialog
      .getByText('Idempotency-Key', { exact: true })
      .locator('xpath=following-sibling::span[1]')
      .textContent();
    if (idempotencyKey === null || idempotencyKey.length === 0) {
      throw new FixtureAssumptionError('Expected the dialog to render its own Idempotency-Key.');
    }

    await dialog.getByRole('button', { name: 'Émettre', exact: true }).click();
    const numberLocator = dialog.locator('.font-mono.font-medium');
    await numberLocator.waitFor({ state: 'visible' });
    const invoiceNumber = await numberLocator.textContent();
    // The seed is deterministic (ADR-0022): this is the firm's first-ever issuance in this
    // database, so the series' own first number is the exact one to assert, not only the shape.
    expect(invoiceNumber).toBe('SEC-2026-000001');

    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/8.3-issuance-dialog-success.png',
      fullPage: false,
    });
    // Two "Fermer" buttons again (see J2's own comment on the same ambiguity): the close icon,
    // then the footer button `IssuanceDialog` renders once `issued !== null`.
    await dialog.getByRole('button', { name: 'Fermer' }).last().click();
    await expect(dialog).toBeHidden();

    // The demo checklist's own next beat: "version imprimable (onglet SSR)". `routing.spec.ts`
    // already proves the link's `href` is the right one; this is the one place any spec actually
    // opens it, in a real new tab (`target="_blank"`), and checks the document on the other end
    // is the server-rendered printable, not the SPA (`main#contenu`, no `#root` — the same
    // discriminator `routing.spec.ts` uses).
    const printablePopup = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Version imprimable' }).click();
    const printable = await printablePopup;
    await printable.waitForLoadState();
    await expect(printable.locator('main#contenu')).toHaveCount(1);
    await expect(printable.locator('#root')).toHaveCount(0);
    await expect(printable.getByRole('heading', { name: 'SEC-2026-000001' })).toBeVisible();
    await printable.close();

    // The replay itself: `IssuanceDialog` has nothing left to click a second time on an invoice
    // it now shows as issued (task 8.3's own "l'offre suit le statut" — same reasoning
    // `pre-facturier-screen.tsx`'s `decidable` already applies) — the real second call a network
    // retry would make is reproduced directly, the same pattern J1's own SSR-refusal step above
    // uses for an edge case the UI cannot represent twice.
    const invoiceId = /\/factures\/([^/?]+)/u.exec(page.url())?.[1];
    if (invoiceId === undefined) {
      throw new FixtureAssumptionError('Expected the detail route to carry the invoice id.');
    }
    const replay = await page.request.post(`/api/v1/invoices/${invoiceId}/issuance`, {
      headers: { origin: browserOrigin(), 'idempotency-key': idempotencyKey },
    });
    expect(replay.ok()).toBe(true);
    const replayBody = (await replay.json()) as { replayed: boolean; invoiceNumber: string };
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.invoiceNumber).toBe('SEC-2026-000001');
  });
});

/**
 * Item 8 (QA round 1): the invoice status filter reads as one bar, not obviously several
 * individually-clickable pills. Run after J4 rather than before: J4 leaves at least one real
 * 'issued' invoice behind (the Réunion one, `SEC-2026-000001`), which is what makes "click Émises,
 * see only issued rows" a meaningful assertion rather than one that would pass on an empty table
 * regardless of the fix.
 */
test.describe('item 8 — the invoice status filter reads as individually-clickable pills', () => {
  test('each pill narrows exclusively, carries a count, and the choice survives a reload', async ({
    page,
  }) => {
    await choosePersona(page, 'billing-paris');
    await page.goto('/factures');

    // `role="button"`/`aria-pressed`, not `role="radio"`: `TogglePillGroup` uses one accessible
    // pattern in both selection modes (see its own comment on why) — a real radio group obliges
    // arrow-key roving-tabindex navigation this component does not implement.
    const allPill = page.getByRole('button', { name: /Toutes/u });
    const issuedPill = page.getByRole('button', { name: /Émises/u });
    await expect(allPill).toHaveAttribute('aria-pressed', 'true');
    await expect(issuedPill).toHaveAttribute('aria-pressed', 'false');

    // The count on "Émises" is read before clicking it, then compared against the table's own
    // row count after — the same number by two different routes is what proves the count is
    // real, not decorative.
    const issuedLabel = (await issuedPill.textContent()) ?? '';
    const issuedCount = /\((\d+)\)/u.exec(issuedLabel)?.[1];
    if (issuedCount === undefined) {
      throw new FixtureAssumptionError('Expected the "Émises" pill to carry a count.');
    }

    await issuedPill.click();
    await expect(issuedPill).toHaveAttribute('aria-pressed', 'true');
    await expect(allPill).toHaveAttribute('aria-pressed', 'false');
    await page.waitForURL(/status=issued/u);

    const rows = page.getByRole('table').locator('tbody tr');
    await expect(rows).toHaveCount(Number.parseInt(issuedCount, 10));
    // Every visible status badge reads "Émise" — the exclusivity itself, not only the count.
    await expect(page.getByText('Émise', { exact: true })).toHaveCount(
      Number.parseInt(issuedCount, 10),
    );
    await expect(page.getByText('Brouillon', { exact: true })).toHaveCount(0);

    // The filter is in the URL, not only in memory.
    await page.reload();
    await expect(issuedPill).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(Number.parseInt(issuedCount, 10));

    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/item8-factures-status-pills.png',
      fullPage: false,
    });
  });
});

test.describe('J3 — manager-paris (Bruno): refuses the month Alice submitted in J1, with a reason', () => {
  test('the manager refuses through the pré-facturier dialog, and Alice sees the reason on her own grid', async ({
    page,
  }) => {
    // J1's own last sub-test already refused this exact Cra once, through the pre-existing SSR
    // route (`docs/open-questions.md`, row dated 25/08/2026 — the JSON route Phase 7 adds had
    // nothing to be driven against until this phase). Annexe B's J3 wants "the month Alice
    // submitted in J1" refused through the SPA's own dialog; that submission was already spent
    // proving the SSR path, so this resubmits the exact same August matrix — nothing is retyped,
    // the grid the refusal left behind (still carrying every line J1 filled) is simply handed
    // back to the manager — before refusing it again, this time through the dialog Phase 7 built.
    await choosePersona(page, 'consultant-paris');
    await page.goto(`/cra/${EDIT_PERIOD}`);
    await page
      .getByText('Ce CRA a été refusé par le manager', { exact: false })
      .waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Soumettre au manager' }).click();
    await page.getByText('Soumis', { exact: true }).waitFor({ state: 'visible' });

    await switchPersonaViaUi(page, 'manager-paris');
    await page.goto(`/pre-facturier?period=${EDIT_PERIOD}`);
    await page.getByRole('heading', { name: 'Les CRA du mois' }).waitFor({ state: 'visible' });

    const aliceRow = page.getByRole('row').filter({ hasText: 'Alice Martin' });
    await aliceRow.getByRole('button', { name: 'Refuser' }).click();

    const refuseDialog = page.getByRole('dialog');
    await refuseDialog.getByText('Refuser le CRA de Alice Martin').waitFor({ state: 'visible' });
    const reason = 'Le 03/08 doit être reventilé sur un seul projet — motif de démonstration J3.';
    await refuseDialog.getByLabel('Motif du refus').fill(reason);
    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/7.3-refuse-dialog.png',
      fullPage: false,
    });

    await refuseDialog.getByRole('button', { name: 'Confirmer le refus' }).click();
    await expect(refuseDialog).toBeHidden();
    await page.getByText('CRA refusé.', { exact: true }).waitFor({ state: 'visible' });

    await switchPersonaViaApi(page, 'consultant-paris');
    await page.goto(`/cra/${EDIT_PERIOD}`);
    await page
      .getByText('Ce CRA a été refusé par le manager', { exact: false })
      .waitFor({ state: 'visible' });
    await expect(page.getByText(reason)).toBeVisible();
  });
});

test.describe('J6 — billing-paris (Henri): the margin URL refuses him, by role, and names the rule', () => {
  test('deep-linking a marge URL as billing renders the designed 403, naming insufficient-role', async ({
    page,
  }) => {
    await choosePersona(page, 'billing-paris');
    // Any real Cra of Henri's own office is enough: `GET .../economics` is manager-only (Annexe
    // A), a role gate ahead of any scope check, so which consultant or period this names does not
    // change the refusal — verified live (`billing-paris` against several different ids and
    // periods, always the same `insufficient-role`).
    const listResponse = await page.request.get('/api/v1/cras?limit=50');
    const { cras } = (await listResponse.json()) as { cras: CraListRowForAssertions[] };
    const anyRow = cras[0];
    if (anyRow === undefined) {
      throw new FixtureAssumptionError(
        'Expected at least one Cra in the seed for billing to read.',
      );
    }

    await page.goto(`/marge/${anyRow.consultantId}?period=${anyRow.period}`);

    await page.getByText('Accès refusé', { exact: true }).waitFor({ state: 'visible' });
    await expect(page.getByText('/problems/insufficient-role')).toBeVisible();
    // Scoped to `DeniedState`'s own `<dl>` — same reason `task 6.5`'s sibling assertion above
    // gives: item 4 (QA round 1) put a coloured `RoleBadge` in the topbar too.
    await expect(page.locator('dl').getByText('Facturation', { exact: true })).toBeVisible();

    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/7.6-marge-denied-insufficient-role.png',
      fullPage: false,
    });
  });
});

test.describe('task 7.6 — a period with nothing in it', () => {
  // 2026-07 until item 6 (QA round 1): the seed's own dense months now cover 2026-06/07/08 for
  // every office (`scripts/lib/seed-data.ts`'s `DENSE_PERIODS`), so Paris genuinely has Cras on
  // 2026-07 today. 2026-12 is outside both `DENSE_PERIODS` and the sparse 2016-2024 historical
  // span `HISTORICAL_VETERANS` writes — no spec in this repository, and no seed period, ever
  // touches it, which is what this test's own point (a period with nothing in it) needs.
  test('2026-12 renders a designed empty pré-facturier, not a blank page', async ({ page }) => {
    await choosePersona(page, 'manager-paris');
    await page.goto('/pre-facturier?period=2026-12');

    // Not the "office has never had a Cra at all" branch (`data.period === null`) — this office
    // has plenty of Cras, just none on this specific period, so the ordinary response comes back
    // empty and each table renders its own `EmptyState` (`routes/_shell/pre-facturier.tsx`'s own
    // comment draws this exact distinction; that other branch has no live persona to demonstrate
    // it, since every seeded office has at least one Cra somewhere).
    await page
      .getByText('Aucun CRA sur ce mois dans cette implantation.')
      .waitFor({ state: 'visible' });
    await expect(
      page.getByText('Aucune facture en brouillon sur ce mois', { exact: false }),
    ).toBeVisible();

    await page.screenshot({
      animations: 'disabled',
      path: 'tests/visual/review/7.6-pre-facturier-empty.png',
      fullPage: false,
    });
  });
});
