import { expect, test, type Page } from '@playwright/test';

/**
 * Annexe B's six e2e journeys. Only **J1** exists in this phase (Phase 6's own exit Gate);
 * J2/J3/J5/J6 (Phase 7) and J4 (Phase 8) are appended by their own phases, in the fixed order
 * Annexe B pins (J1 → {J2, J3} → J4; J5/J6 read-only anywhere after J1) — this file's
 * `test.describe.configure({ mode: 'serial' })` is what makes that order binding within the file,
 * and `playwright.config.ts`'s `journeys` project (`fullyParallel: false`, `workers: 1`) is what
 * stops a second worker from picking up one of these tests out of turn.
 *
 * Run via `pnpm --filter @erp/web exec playwright test --project=journeys` (or the default `pnpm
 * run test:e2e` once Phase 9.6 wires CI to it) — `playwright.config.ts`'s `webServer` resets the
 * database and starts both the API and Vite; nothing here starts either itself.
 *
 * **A genuine seed/plan mismatch, discovered by querying the live grid before writing this
 * spec, not assumed from the plan's prose**: Annexe B describes J1 entirely on `2026-06`, but
 * `scripts/lib/seed-data.ts` validates Alice's June Cra (`SUBMITTED_NOT_VALIDATED_EMAIL` names
 * only Claire) — confirmed live: `GET /api/v1/cras/2026-06/grid` as `consultant-paris` answers
 * `status: "validated"`, `editable: false`. A validated Cra is immutable (ADR-0005); "éditer un
 * créneau" on `2026-06` is therefore not possible against this seed, ever, however this screen is
 * built. `docs/open-questions.md` (row dated 25/08/2026) records this for Phase 7 (J3 presumes
 * the month J1 submits is the same one Bruno then refuses, and Phase 7's own fiche needs to know
 * which period that is).
 *
 * This spec keeps **both halves of J1's intent**, on the periods that can actually carry them:
 * the seed-verification half runs against the real, validated `2026-06` (read-only — everything
 * Annexe B asks to verify is visible there regardless of editability); the edit → save → reopen →
 * submit half runs against `2026-08`, a period `GET /api/v1/cras/2026-08/grid` confirms is
 * `status: null` / `editable: true` for Alice, with her same two real missions staffed (both
 * assignments are open-ended in the seed, so August is no different from June on that count). The
 * "day split across two missions" and "absence" facts are recreated **live**, through the actual
 * UI, rather than read off static seed data that does not exist on an editable month — the same
 * capability the plan asks to see, demonstrated rather than inherited.
 */

test.describe.configure({ mode: 'serial' });

class MissingCraError extends Error {}

const DORA = 'Audit DORA — Banque Nationale';
const PASSI = 'Audit PASSI — Banque Nationale';
const EDIT_PERIOD = '2026-08';

// `page.request` is Playwright's own HTTP client, not the browser's `fetch()` — it shares cookies
// with the page's context but does not set an `Origin` header the way a real in-page fetch does
// (discovered running this spec: every `page.request.post` below 403'd with
// `/problems/forbidden-origin` until this header was added by hand). The dev topology's own
// origin (ADR-0063 §"Task 0.3") is what the API's `registerOriginCheck` compares against.
const DEV_ORIGIN = 'http://127.0.0.1:5173';

// `vite.config.ts`'s `PROXIED_PATHS` proxies `/api`, `/facture`, `/releve`, `/healthz`, `/readyz`
// to the API — `/pre-facturier` is not in that list (the dev topology proxies only what the SPA
// itself calls, and this SSR path is not one). A relative `page.request.post('/pre-facturier/…')`
// therefore hits Vite's own dev server, which 404s it (discovered running this spec: an empty
// 404 body, not `craNotFound`'s `problem+json` one). The API's own origin is used instead for
// this one call — `registerOriginCheck` compares the `Origin` **header**, not which port
// physically received the request, and the persona cookie is host-scoped (`127.0.0.1`) rather
// than port-scoped, so it travels to this origin the same as it does to the proxy's.
const API_ORIGIN = 'http://127.0.0.1:3000';

interface GridResponseForAssertions {
  readonly craId: string | null;
  readonly status: string | null;
  readonly lines: readonly {
    readonly day: string;
    readonly dayType: string;
    readonly quarterDays: number;
  }[];
}

/** The one `as` in this file, isolated here per `api-client.ts`'s own `parseJson` precedent — a
 * direct `.json()` read is untyped, and every call site below wants the same three fields. */
async function fetchGrid(page: Page, period: string): Promise<GridResponseForAssertions> {
  const response = await page.request.get(`/api/v1/cras/${period}/grid`);

  return (await response.json()) as GridResponseForAssertions;
}

async function choosePersona(page: Page, personaKey: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

/** Switches the session's persona without leaving the current page — used for the manager-side
 * refusal step, which task 6.4's evidence needs but which has no `/api/v1` route yet (see the
 * refusal step below for why the pre-existing SSR form endpoint is used instead). */
async function switchPersonaViaApi(page: Page, personaKey: string): Promise<void> {
  const response = await page.request.post('/api/v1/session/persona', {
    data: { key: personaKey },
    headers: { origin: DEV_ORIGIN },
  });
  expect(response.ok()).toBe(true);
}

test.describe('J1 — consultant-paris (Alice): the seed on 2026-06, then edit/save/submit', () => {
  test('the validated June grid shows exactly what the seed says it does', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra/2026-06');

    await page.getByText('CRA validé', { exact: false }).waitFor({ state: 'visible' });

    // `.first()`: the grid table renders before the totals panel's own table in the DOM, and
    // both are `role="table"` — an unscoped `getByRole('table')` matches both, whose combined
    // `tbody tr` count is not the number of days in the month (discovered running this test).
    const rows = page.getByRole('table').first().locator('tbody tr');
    await expect(rows).toHaveCount(30);

    // 11/06 — two missions on the same day, two quarter-days each (VARIED_MONTH.splitDay).
    const splitDayCells = rows.nth(10).locator('td');
    await expect(splitDayCells.nth(0)).toHaveText(DORA);
    await expect(splitDayCells.nth(1)).toHaveText(PASSI);

    // 18/06 — a full-day absence (VARIED_MONTH.absenceDay).
    const absenceDayCells = rows.nth(17).locator('td');
    await expect(absenceDayCells.nth(0)).toHaveText('Absence');
    await expect(absenceDayCells.nth(1)).toHaveText('Absence');

    // 13/06 — a worked Saturday, flagged rather than blocked (VARIED_MONTH.flaggedSaturday).
    const saturdayRow = rows.nth(12);
    await expect(saturdayRow.locator('th')).toContainText('Week-end');
    await expect(saturdayRow.locator('th')).toContainText('Signalé');
    const saturdayCells = saturdayRow.locator('td');
    await expect(saturdayCells.nth(0)).toHaveText(DORA);
    await expect(saturdayCells.nth(1)).toHaveText(DORA);

    await page.screenshot({
      path: 'tests/visual/review/6.4-cra-grid-validated.png',
      fullPage: false,
    });
  });

  test('an empty month, editing a shared day and an absence, saving, reopening, submitting', async ({
    page,
  }) => {
    // Submission is a domain rule, not a UI nicety (`assertMonthAddsUp`,
    // `packages/timesheet/src/domain/submission-checks.ts`): every workable day needs four
    // recorded quarter-days or `cra.submit()` throws `IncompleteCraError`. Filling in the 21
    // workable days of August 2026 (discovered live: `GET /api/v1/cras/2026-08/grid`'s own
    // `days`, filtered on `nonWorkable === null`) is genuinely slower than the default 30s spec
    // timeout.
    test.setTimeout(90_000);

    await choosePersona(page, 'consultant-paris');
    await page.goto(`/cra/${EDIT_PERIOD}`);

    // The month has never been saved: an ordinary editable grid under an informational banner,
    // not a placeholder (task 6.5's "grille vierge invitante").
    await page.locator('#cra-slot-2026-08-03-0').waitFor({ state: 'visible' });
    await page
      .getByText('Ce mois n’a pas encore été commencé', { exact: false })
      .waitFor({ state: 'visible' });
    await page.screenshot({
      path: 'tests/visual/review/6.5-cra-grid-empty-month.png',
      fullPage: false,
    });

    // Keyboard-focus evidence (task 6.2): a slot control focused, ring visible.
    await page.locator('#cra-slot-2026-08-03-0').focus();
    await page.screenshot({
      path: 'tests/visual/review/6.2-cra-grid-keyboard-focus.png',
      fullPage: false,
    });

    // A shared day (03/08, a Monday) across Alice's two real missions, and a full-day absence
    // (04/08) — recreated live, the same shape the seed's June carries on a month that can
    // actually be edited.
    await page.locator('#cra-slot-2026-08-03-0').selectOption({ label: DORA });
    await page.locator('#cra-slot-2026-08-03-1').selectOption({ label: PASSI });
    await page.locator('#cra-slot-2026-08-04-0').selectOption({ label: 'Absence' });
    await page.locator('#cra-slot-2026-08-04-1').selectOption({ label: 'Absence' });

    await page.screenshot({ path: 'tests/visual/review/6.2-cra-grid-draft.png', fullPage: false });

    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Enregistré', { exact: true }).waitFor({ state: 'visible' });

    // Reopen: a full page reload, not the SPA's own cache — the Gate's own wording ("rouvrir, la
    // modification persiste") is a claim about the server, and only a fresh load proves it.
    await page.reload();
    await page.locator('#cra-slot-2026-08-03-0').waitFor({ state: 'visible' });

    await expect(page.locator('#cra-slot-2026-08-03-0 option:checked')).toHaveText(DORA);
    await expect(page.locator('#cra-slot-2026-08-03-1 option:checked')).toHaveText(PASSI);
    await expect(page.locator('#cra-slot-2026-08-04-0 option:checked')).toHaveText('Absence');
    await expect(page.locator('#cra-slot-2026-08-04-1 option:checked')).toHaveText('Absence');

    // The same fact, verified at the data layer rather than only in the DOM — a fresh read, not
    // the page's own cache.
    const reread = await fetchGrid(page, EDIT_PERIOD);
    expect(reread.status).toBe('draft');
    expect(reread.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ day: '2026-08-04', dayType: 'absence', quarterDays: 4 }),
      ]),
    );

    // Submission needs the whole month complete, not only the two demonstration days above —
    // every other workable day gets a full day on Alice's main mission.
    const otherWorkableDays = [
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-31',
    ];
    for (const day of otherWorkableDays) {
      // after the previous one; Playwright actions are not meaningfully parallelisable here.
      await page.locator(`#cra-slot-${day}-0`).selectOption({ label: DORA });
      await page.locator(`#cra-slot-${day}-1`).selectOption({ label: DORA });
    }

    await page.getByRole('button', { name: 'Soumettre au manager' }).click();
    await page.getByText('Soumis', { exact: true }).waitFor({ state: 'visible' });

    await page.getByText('CRA soumis', { exact: false }).waitFor({ state: 'visible' });
    await expect(page.locator('select')).toHaveCount(0);
    await page.screenshot({
      path: 'tests/visual/review/6.4-cra-grid-submitted.png',
      fullPage: false,
    });
  });

  test('a manager refusal (via the pre-existing SSR endpoint) shows the reason, grid re-editable', async ({
    page,
  }) => {
    // `docs/frontend-plan.md` Annexe A names no `/api/v1` refusal route — only
    // `POST /api/v1/cras/:id/validation` exists for the manager side (Phase 7 is where the SPA's
    // own Valider/Refuser dialogs land). The domain and its HTTP surface for a refusal already
    // exist and are already tested (`apps/api/src/chain/refuse-cra.ts`,
    // `PATHS.refuseCra` = `/pre-facturier/refus/:id`) — driving that real endpoint here is
    // evidence from the real chain, not a fabricated banner (`docs/open-questions.md`, row dated
    // 25/08/2026, names Phase 7 as the phase that gives the SPA its own route for this).
    await choosePersona(page, 'consultant-paris');
    const before = await fetchGrid(page, EDIT_PERIOD);
    expect(before.status).toBe('submitted');
    if (before.craId === null) {
      throw new MissingCraError('Expected the previous test to have saved a Cra.');
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
    // Refused is re-editable (task 6.4): the slot controls are back.
    await expect(page.locator('select').first()).toBeVisible();

    await page.screenshot({
      path: 'tests/visual/review/6.4-cra-grid-refused.png',
      fullPage: false,
    });
  });
});

test.describe('task 6.5 — a role this route cannot serve', () => {
  test('a manager on /cra/2026-06 gets the designed denied screen, not a crash', async ({
    page,
  }) => {
    // `GET /api/v1/cras/:period/grid` is `forRoles('consultant')` and the path carries no
    // consultant id — it is always the caller's own month, so a manager reaches
    // `insufficient-role`, never `out-of-scope` (`docs/open-questions.md`, row dated 25/08/2026,
    // names the mismatch between this file's name and the refusal actually reachable here — both
    // classify to the same `DeniedState`).
    await choosePersona(page, 'manager-paris');
    await page.goto('/cra/2026-06');

    await page.getByText('Accès refusé', { exact: true }).waitFor({ state: 'visible' });
    await expect(page.getByText('/problems/insufficient-role')).toBeVisible();
    await expect(page.getByText('Manager', { exact: true })).toBeVisible();

    await page.screenshot({
      path: 'tests/visual/review/6.5-cra-denied-out-of-scope.png',
      fullPage: false,
    });
  });
});

test.describe('task 6.1 — the month list', () => {
  test('Mes CRA lists both of Alice’s months', async ({ page }) => {
    await choosePersona(page, 'consultant-paris');
    await page.goto('/cra');

    await expect(page.getByRole('columnheader', { name: 'Mois' })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(3); // header + 2026-06 + 2026-08

    await page.screenshot({ path: 'tests/visual/review/6.1-cra-list.png', fullPage: false });
  });
});
