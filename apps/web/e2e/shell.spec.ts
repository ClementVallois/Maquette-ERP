import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 4's own Gate (frontend-plan.md, the Phase 4 exit line): "pour chaque persona, la nav
 * montre exactement les entrées de son rôle ; un deep-link sans cookie redirige vers `/` ;
 * screenshots du shell par persona ; `pnpm run check` vert."
 *
 * Run against a live API and a seeded database, following `personas-live.spec.ts`'s precedent —
 * `webServer` starts only Vite:
 *
 *   pnpm run db:reset
 *   pnpm run api &
 *   pnpm --filter @erp/web exec playwright test shell.spec.ts
 *
 * "Exactement" is a negative assertion as much as a positive one (BUILD-RULES' "green gate that
 * stopped looking" family): a nav that rendered every entry to every role would still pass a
 * presence-only check, so each case below asserts the full, ordered label list, not a subset.
 */

class ApiNotReachableError extends Error {}

test.beforeAll(async ({ baseURL }) => {
  if (baseURL === undefined) {
    throw new ApiNotReachableError('playwright.config.ts carries no baseURL.');
  }

  const url = new URL('/api/v1/personas', baseURL).toString();
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new ApiNotReachableError(
      `${url} did not respond. Start the API first: pnpm run db:reset && pnpm run api.`,
      { cause },
    );
  }
  if (!response.ok) {
    throw new ApiNotReachableError(
      `${url} answered ${String(response.status)}. Seed and start the API.`,
    );
  }
});

async function choosePersona(page: Page, personaKey: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

function sidebarNav(page: Page) {
  return page.locator('nav[aria-label="Navigation principale"]').first();
}

async function navLabels(page: Page): Promise<string[]> {
  const links = sidebarNav(page).locator('a');
  // `allTextContents()` does not auto-wait (rule 0bis.9's "wait on state" applies here too): it
  // reads whatever matches at the instant it is called, and the shell's `beforeLoad` can still be
  // resolving `ensureQueryData` the instant `waitForURL` settles. Waiting for the first entry to
  // be visible is the state this test actually needs, not a delay.
  await links.first().waitFor({ state: 'visible' });

  return links.allTextContents();
}

test.describe('nav shows exactly the entries of the session role', () => {
  test('consultant (Alice, consultant-paris): Tableau de bord, Mes CRA — nothing else', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for the label check');

    await choosePersona(page, 'consultant-paris');
    const labels = await navLabels(page);

    expect(labels).toStrictEqual(['Tableau de bord', 'Mes CRA']);
  });

  test('manager (Bruno, manager-paris): Tableau de bord, Pré-facturier, CRA, Factures, Marge', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for the label check');

    await choosePersona(page, 'manager-paris');
    const labels = await navLabels(page);

    expect(labels).toStrictEqual(['Tableau de bord', 'Pré-facturier', 'CRA', 'Factures', 'Marge']);
  });

  test('manager (Emma, manager-lyon): the same five entries as any other manager', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for the label check');

    await choosePersona(page, 'manager-lyon');
    const labels = await navLabels(page);

    expect(labels).toStrictEqual(['Tableau de bord', 'Pré-facturier', 'CRA', 'Factures', 'Marge']);
  });

  test('billing (Henri, billing-paris): Tableau de bord, Pré-facturier, Factures — never CRA or Marge', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for the label check');

    await choosePersona(page, 'billing-paris');
    const labels = await navLabels(page);

    expect(labels).toStrictEqual(['Tableau de bord', 'Pré-facturier', 'Factures']);
    // Restated as an explicit absence, not only as "the array has exactly these three": Cjm/Tjm/
    // margin never appear outside the margin screen (Annexe C.12), and Marge is the nav entry
    // that would put them one click away from a role that must not reach them.
    expect(labels).not.toContain('Marge');
  });
});

test.describe('guards', () => {
  test('a deep-link with no persona cookie redirects to /', async ({ page }) => {
    await page.goto('/tableau-de-bord');
    await page.waitForURL('/');

    await expect(page.getByRole('heading', { name: 'Choisir un persona' })).toBeVisible();
  });

  test('a deep-link with a cookie this instance does not recognise also redirects to /', async ({
    page,
    context,
    baseURL,
  }) => {
    // `GET /api/v1/session` is `PUBLIC` (`apps/api/src/routes/session.ts`) and answers
    // `{ persona: null }` for an unresolvable cookie exactly as it does for none at all — verified
    // directly (`curl --cookie "erp_persona=garbage.value"` against a `forRoles`-guarded route
    // answers `403 /problems/unknown-persona`, but the session route itself never does). So this
    // exercises `routes/_shell.tsx`'s client-side `persona === null` branch, not a caught
    // `/problems/unknown-persona` — the global purge-and-toast path in
    // `features/session/session-guard.ts` is not reachable from any request Phase 4 issues, which
    // is recorded as such in the Phase 4 checkpoint rather than asserted here as something this
    // test cannot actually prove.
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5173').origin;
    await context.addCookies([
      { name: 'erp_persona', value: 'not-a-real-signed-value', url: origin },
    ]);

    await page.goto('/tableau-de-bord');
    await page.waitForURL('/');

    await expect(page.getByRole('heading', { name: 'Choisir un persona' })).toBeVisible();
  });
});

test.describe('screenshots — the shell per persona (rule 0bis.10)', () => {
  const personas: readonly { key: string; label: string }[] = [
    { key: 'consultant-paris', label: 'consultant-paris' },
    { key: 'manager-paris', label: 'manager-paris' },
    { key: 'manager-lyon', label: 'manager-lyon' },
    { key: 'billing-paris', label: 'billing-paris' },
  ];

  for (const persona of personas) {
    test(`shell — ${persona.label}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'one capture per persona is enough here');

      await choosePersona(page, persona.key);
      await expect(sidebarNav(page).locator('a').first()).toBeVisible();

      await page.screenshot({
        path: `tests/visual/review/4.2-shell-${persona.label}.png`,
        fullPage: false,
      });
    });
  }

  test('persona selector — the demo’s first screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one capture is enough here');

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Choisir un persona' })).toBeVisible();
    await expect(page.locator('[data-persona-key="consultant-paris"]')).toBeVisible();

    await page.screenshot({
      path: 'tests/visual/review/4.1-persona-selector.png',
      fullPage: false,
    });
  });

  test('shell on mobile — the sidebar becomes a Sheet below md (4.5)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-shell', 'this is the one responsive capture');

    await choosePersona(page, 'manager-paris');
    // The persistent aside is hidden below `md`; the topbar's menu button opens the Sheet.
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.screenshot({
      path: 'tests/visual/review/4.5-shell-mobile-sheet.png',
      fullPage: false,
    });
  });
});
