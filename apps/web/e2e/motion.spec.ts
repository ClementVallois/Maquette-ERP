import { expect, test } from '@playwright/test';

/**
 * Task 10.1: "`prefers-reduced-motion` vérifié en émulation Playwright". `styles/globals.css`'s
 * `@media (prefers-reduced-motion: reduce)` block collapses every `animation-duration` and
 * `transition-duration` to `0.01ms` — this is the one test that proves the rule actually reaches
 * a real animated element rather than trusting the stylesheet on its own.
 *
 * The kitchen sink (`/dev/composants`, task 2.6) is the fixture: it renders one of every
 * component, including the two families `direction-visuelle.md` §8 names — a CSS `animation`
 * (the `Skeleton`'s pulse) and a Radix open/close `transition` (`Dialog`'s `data-open:animate-in`)
 * — without needing a persona or a live API.
 *
 * Each check is paired with its own negative: a sibling test with **no** emulation asserts the
 * *same* element's duration is a real, non-zero value first. Without that pairing, a stylesheet
 * that zeroed every duration unconditionally would pass this file's positive half for a reason
 * that has nothing to do with `prefers-reduced-motion` — the "green gate that stopped looking"
 * BUILD-RULES names.
 */

// `globals.css` writes `0.01ms`, but Chromium's `getComputedStyle` always serialises a computed
// time property in seconds — `0.01ms` **is** `1e-05s`, and that is the string this file's own
// Chromium project (`playwright.config.ts`) actually reports. Confirmed live rather than derived:
// this repository's money rule (`no-restricted-syntax`, ADR-0002) forbids `parseFloat`/`Number()`
// on a decimal string everywhere, so the comparison below is against a literal, not a parsed one.
const REDUCED = '1e-05s';

test.describe('prefers-reduced-motion — a CSS animation (Skeleton’s pulse)', () => {
  test('runs at its designed duration with no preference emulated', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for a CSS-only check');

    await page.goto('/dev/composants');
    const skeleton = page.locator('[data-slot="skeleton"]').first();
    await skeleton.waitFor({ state: 'visible' });

    const duration = await skeleton.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(duration).not.toBe(REDUCED);
  });

  test('collapses to near-zero once prefers-reduced-motion: reduce is emulated', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for a CSS-only check');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dev/composants');
    const skeleton = page.locator('[data-slot="skeleton"]').first();
    await skeleton.waitFor({ state: 'visible' });

    const duration = await skeleton.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(duration).toBe(REDUCED);
  });
});

test.describe('prefers-reduced-motion — a Radix open transition (Dialog)', () => {
  test('animates in at its designed duration with no preference emulated', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for a CSS-only check');

    await page.goto('/dev/composants');
    await page.getByRole('button', { name: 'Ouvrir un dialog' }).click();
    const content = page.getByRole('dialog', { name: 'Résultat de la validation' });
    await content.waitFor({ state: 'visible' });

    const duration = await content.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(duration).not.toBe(REDUCED);
  });

  test('collapses to near-zero once prefers-reduced-motion: reduce is emulated', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for a CSS-only check');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dev/composants');
    await page.getByRole('button', { name: 'Ouvrir un dialog' }).click();
    const content = page.getByRole('dialog', { name: 'Résultat de la validation' });
    await content.waitFor({ state: 'visible' });

    const duration = await content.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(duration).toBe(REDUCED);
  });
});
