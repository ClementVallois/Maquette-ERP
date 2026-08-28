import { expect, test } from '@playwright/test';

// Phase 1's placeholder heading ("ERP — Maquette") is gone: Phase 2 replaced `App.tsx`'s content
// with the kitchen sink (frontend-plan.md task 2.6), and the smoke test's job is still "the
// toolchain boots with no console error" — so it checked the kitchen sink's own page title.
//
// Phase 4 moves. `playwright.config.ts`'s `webServer` starts **Vite only** (`pnpm run dev`), and
// this is deliberately the one spec that must pass with no API process running at all — it is the
// toolchain's own boot check, not a gate on live data. `/` now renders the real persona selector
// (`routes/index.tsx`), which fetches `GET /api/v1/personas` on mount: against a dead proxy target
// that fetch fails and logs a console error, which would make this spec fail for a reason that has
// nothing to do with "did the toolchain boot". `/dev/composants` (Phase 4 task, `docs/open-questions.md`
// Phase 3 checkpoint point 5) fetches nothing at all — the kitchen sink's own header says its data
// is illustrative, never fetched — so it is what stays the API-free check. `e2e/personas-live.spec.ts`
// is where `/` is actually exercised, against a live API.
test('the app boots with no console error', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/dev/composants');

  await expect(page.getByRole('heading', { name: 'Kitchen sink — design system' })).toBeVisible();
  expect(consoleErrors).toStrictEqual([]);
});
