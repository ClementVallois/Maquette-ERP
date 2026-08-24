import { expect, test } from '@playwright/test';

// Phase 2's exit gate (frontend-plan.md task 2.6): a baseline screenshot of the kitchen sink at
// the 1440 viewport, committed to `tests/visual/baseline/` (not gitignored — .gitignore says so
// explicitly) as the design system's visual reference. One screenshot, taken once here and then
// re-captured only when the design system itself changes — this is not a per-commit visual-regression
// suite, Phase 10.6 is where the baseline gets frozen for real.
test('kitchen sink — baseline screenshot at 1440', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the baseline is captured once, at 1440');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kitchen sink — design system' })).toBeVisible();

  await page.screenshot({
    path: 'tests/visual/baseline/kitchen-sink.png',
    fullPage: true,
  });
});
