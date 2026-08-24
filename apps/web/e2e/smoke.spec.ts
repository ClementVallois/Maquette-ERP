import { expect, test } from '@playwright/test';

// Phase 1's placeholder heading ("ERP — Maquette") is gone: Phase 2 replaced `App.tsx`'s content
// with the kitchen sink (frontend-plan.md task 2.6), and the smoke test's job is still "the
// toolchain boots with no console error" — so it now checks the kitchen sink's own page title
// instead. Phase 6 replaces this file with the six real journeys (Annexe B).
test('the app boots with no console error', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Kitchen sink — design system' })).toBeVisible();
  expect(consoleErrors).toStrictEqual([]);
});
