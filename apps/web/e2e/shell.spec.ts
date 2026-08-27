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

  test('manager (Bruno, manager-paris): Tableau de bord, Pré-facturier, CRA, Factures — no standing Marge entry', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for the label check');

    await choosePersona(page, 'manager-paris');
    const labels = await navLabels(page);

    // No `Marge` here: Phase 7 (task 7.5) removed the placeholder standing entry Phase 4 had
    // added (`docs/open-questions.md`, row dated 24/08/2026, resolved) — the real margin screen
    // is reached only by an explicit click off a pré-facturier row (ADR-0052, "jamais un survol"),
    // never from the sidebar.
    expect(labels).toStrictEqual(['Tableau de bord', 'Pré-facturier', 'CRA', 'Factures']);
  });

  test('manager (Emma, manager-lyon): the same four entries as any other manager', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for the label check');

    await choosePersona(page, 'manager-lyon');
    const labels = await navLabels(page);

    expect(labels).toStrictEqual(['Tableau de bord', 'Pré-facturier', 'CRA', 'Factures']);
  });

  test('billing (Henri, billing-paris): Tableau de bord, Pré-facturier, Factures — never CRA or Marge', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for the label check');

    await choosePersona(page, 'billing-paris');
    const labels = await navLabels(page);

    expect(labels).toStrictEqual(['Tableau de bord', 'Pré-facturier', 'Factures']);
    // Restated as an explicit absence, not only as "the array has exactly these three": no role
    // has a standing `Marge` nav entry any more (Phase 7, task 7.5) — the margin screen is
    // reached only by an explicit click off a pré-facturier row, which billing's own `Refuser`/
    // `Valider`-less table (task 7.4) never renders for this role either
    // (`pre-facturier-screen.tsx`'s `craColumns`, filtered on `role === 'manager'`).
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
    // `/problems/unknown-persona`. **Updated 25/08/2026**: the global purge-and-toast path this
    // comment used to call unreachable is now provable — see the next test, added for
    // `docs/open-questions.md`'s row of 24/08/2026 ("Resolve in Phase 6, task 6.1 … the first
    // guarded endpoint the SPA calls").
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5173').origin;
    await context.addCookies([
      { name: 'erp_persona', value: 'not-a-real-signed-value', url: origin },
    ]);

    await page.goto('/tableau-de-bord');
    await page.waitForURL('/');

    await expect(page.getByRole('heading', { name: 'Choisir un persona' })).toBeVisible();
  });

  test('a session that turns unknown mid-visit is purged, toasted, and redirected (task 6.1)', async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    // Below `md` the sidebar link this test clicks lives behind the mobile `Sheet` toggle, not in
    // the page directly (direction-visuelle.md §6) — one viewport is enough for a guard behaviour
    // that has nothing to do with responsive layout.
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for this guard');

    // `docs/open-questions.md`, row dated 24/08/2026: `session-guard.ts`'s `unknown-persona`
    // branch had no live proof because Phase 4 built no screen that calls a `forRoles`-guarded
    // endpoint — `GET /api/v1/session` (what `_shell.tsx`'s `beforeLoad` reads) is `PUBLIC` and
    // never answers it. Phase 6's `GET /api/v1/cras` (task 6.1) is the first one that does, which
    // is what this test reaches.
    //
    // The sequence matters: choosing a persona first (a real, valid cookie) means
    // `sessionQueryOptions`'s cache is warm when the cookie is corrupted underneath it — within
    // `lib/query-client.ts`'s 30s `staleTime`, navigating to `/cra` resolves `_shell`'s guard from
    // that cache without a network call, so the corrupted cookie is never sent to `/api/v1/session`
    // at all. It reaches the server for the first time on `CraListScreen`'s own
    // `GET /api/v1/cras` — a fresh query key, always a real fetch — which is exactly the live
    // `403 /problems/unknown-persona` `session-guard.ts` exists to catch.
    await choosePersona(page, 'consultant-paris');
    // Phase 8's own dashboard (task 8.4) made this wait load-bearing where it previously did
    // nothing: `choosePersona` returns the instant the URL becomes `/tableau-de-bord`, before the
    // new route's own effects have necessarily run, and `/tableau-de-bord` now fetches
    // `GET /api/v1/dashboard` itself — a `forRoles`-guarded route, exactly the kind this test's
    // corrupted cookie is meant to reach for the first time on `/cra`, not here. Without this
    // wait, that request can still be in flight (or not yet dispatched) when the cookie below is
    // corrupted, so *it* becomes the first guarded call to answer `unknown-persona` — the global
    // guard (`session-guard.ts`) fires `window.location.assign('/')` while Playwright is mid-click
    // on "Mes CRA", tearing the page down under the click ("element was detached from the DOM").
    // Reproduced live before this wait was added. Waiting for the dashboard's own first StatCard
    // settles that query (a real fetch, the still-valid cookie) before the corruption below runs.
    await page.getByText('Statut du mois').waitFor({ state: 'visible' });

    const origin = new URL(baseURL ?? 'http://127.0.0.1:5173').origin;
    await context.addCookies([
      { name: 'erp_persona', value: 'not-a-real-signed-value', url: origin },
    ]);

    // A client-side transition, not `page.goto('/cra')`: `goto` is a hard navigation that tears
    // down the whole page — including the in-memory `QueryClient` — so `_shell.tsx`'s `beforeLoad`
    // would run against an **empty** cache and re-fetch `GET /api/v1/session` for real. That
    // route is `PUBLIC` and answers `{ persona: null }` for this same corrupted cookie (verified
    // earlier in this file), so the redirect would come from `_shell.tsx`'s own client-side guard
    // — the already-covered path the previous test proves — and `GET /api/v1/cras` would never be
    // called at all (discovered running exactly that version of this test: the redirect completed
    // and `waitForResponse` for `/api/v1/cras` timed out because the request never happened).
    // Clicking the sidebar link keeps the warm, still-fresh `sessionQueryOptions` cache
    // (`lib/query-client.ts`'s 30s `staleTime`) in place, so the corrupted cookie reaches the
    // server for the first time on `CraListScreen`'s own fetch, exactly as the row this test
    // resolves describes.
    const unauthorized = page.waitForResponse(
      (response) => response.url().includes('/api/v1/cras') && response.status() === 403,
    );
    await page.getByRole('link', { name: 'Mes CRA' }).click();
    await unauthorized;

    await page
      .getByText('Votre persona n’est plus reconnue', { exact: false })
      .waitFor({ state: 'visible' });
    await page.waitForURL('/');
    await expect(page.getByRole('heading', { name: 'Choisir un persona' })).toBeVisible();

    // The purge is real, not only the client-side redirect: a fresh read confirms the cookie no
    // longer resolves to anything, server-side.
    const sessionResponse = await page.request.get('/api/v1/session');
    const session = (await sessionResponse.json()) as { persona: unknown };
    expect(session.persona).toBeNull();
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
