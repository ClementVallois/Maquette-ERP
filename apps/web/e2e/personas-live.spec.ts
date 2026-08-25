import { expect, test } from '@playwright/test';

/**
 * Phase 3's Gate evidence (frontend-plan.md task 3.6): the four seed personas, actually fetched
 * through the dev proxy — no MSW, no fixture. Phase 4 replaced `src/App.tsx`'s
 * `PersonasGateEvidence` block with the real screen this fetch backs, `routes/index.tsx`'s persona
 * selector (`usePersonas`, unchanged) — the assertions below were updated for the new layout (a
 * card per persona, `data-persona-key` + separate name/role/office text nodes, rather than one
 * concatenated "Name — role — office" string), the screenshot path is unchanged (still Phase 3's
 * own evidence, not Phase 4's — Phase 4's own shell screenshots land under `4.x-*.png`).
 *
 * `playwright.config.ts`'s `webServer` starts only Vite (`pnpm run dev`) — it has never needed the
 * API before this spec. This one does: `GET /api/v1/personas` proxies to `http://127.0.0.1:3000`
 * (`vite.config.ts`, ADR-0063), and nothing here starts that process. Run against a live API and
 * a seeded database:
 *
 *   pnpm run migrate && pnpm run seed   # or: pnpm run db:reset
 *   pnpm run api &                      # a second terminal, or backgrounded
 *   pnpm --filter @erp/web exec playwright test personas-live.spec.ts
 *
 * `beforeAll` below checks the API is actually reachable through the very path the page will use
 * and fails loudly, naming the fix, rather than letting the spec screenshot an error state and
 * pass — a screenshot of a failure is not gate evidence (frontend-plan.md rule 0bis.9's spirit
 * applied to setup, not only to waits).
 */

class ApiNotReachableError extends Error {}

test.beforeAll(async ({ baseURL }) => {
  if (baseURL === undefined) {
    throw new ApiNotReachableError(
      'playwright.config.ts carries no baseURL — cannot reach the dev proxy at all.',
    );
  }

  const url = new URL('/api/v1/personas', baseURL).toString();

  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new ApiNotReachableError(
      `${url} did not respond. Start the API first: pnpm run migrate && pnpm run seed && pnpm run api.`,
      { cause },
    );
  }

  if (!response.ok) {
    throw new ApiNotReachableError(
      `${url} answered ${String(response.status)}. Seed the database and start the API: ` +
        'pnpm run migrate && pnpm run seed && pnpm run api.',
    );
  }
});

test('the four seed personas render, fetched live through the dev proxy', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one capture is enough for this gate');

  await page.goto('/');

  // Waits on state, never on a delay or on `networkidle` (frontend-plan.md rule 0bis.9):
  // `networkidle` would pass just as well on an empty list rendered before the fetch settles.
  const alice = page.locator('[data-persona-key="consultant-paris"]');
  const bruno = page.locator('[data-persona-key="manager-paris"]');
  const emma = page.locator('[data-persona-key="manager-lyon"]');
  const henri = page.locator('[data-persona-key="billing-paris"]');

  await expect(alice).toContainText('Alice Martin');
  await expect(alice).toContainText('Consultant');
  await expect(alice).toContainText('Paris');

  await expect(bruno).toContainText('Bruno Leroy');
  await expect(bruno).toContainText('Manager');
  await expect(bruno).toContainText('Paris');

  await expect(emma).toContainText('Emma Robert');
  await expect(emma).toContainText('Manager');
  await expect(emma).toContainText('Lyon');

  await expect(henri).toContainText('Henri Laurent');
  await expect(henri).toContainText('Facturation');
  await expect(henri).toContainText('Paris');

  await page.screenshot({
    path: 'tests/visual/review/3.6-personas-live.png',
    fullPage: false,
  });
});
