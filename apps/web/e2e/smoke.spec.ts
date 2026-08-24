import { expect, test } from '@playwright/test';

// Phase 1's whole claim: the toolchain boots. Phase 6 replaces this with the six real journeys
// (Annexe B); this one asserts nothing about the product because there is no product yet.
test('the app boots with no console error', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'ERP — Maquette' })).toBeVisible();
  expect(consoleErrors).toStrictEqual([]);
});
