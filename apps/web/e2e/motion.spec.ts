import { expect, test } from '@playwright/test';

/** Typed rather than a bare `new Error()` — this repository's own rule (`no-restricted-syntax`)
 * applies uniformly, including to its own test suite. */
class LayoutAssumptionError extends Error {}

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

/**
 * Items 7+10 (QA round 2): "the list goes over the [trigger], not under it" — Radix's
 * `item-aligned` default deliberately overlays the selected option on the trigger, like a native
 * `<select>`. The kitchen sink's own `Select` opens with `defaultValue="paris"` set, which is
 * exactly the shape that makes `item-aligned` overlay rather than merely align — the regression
 * this test would have caught.
 */
test.describe('items 7+10 — a Select panel opens below its trigger, not over it', () => {
  test('the panel starts at or below the trigger’s own bottom edge, same width', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for a layout check');

    await page.goto('/dev/composants');
    const trigger = page.locator('#ks-select');
    await trigger.click();
    const content = page.locator('[data-slot="select-content"]');
    await content.waitFor({ state: 'visible' });

    const triggerBox = await trigger.boundingBox();
    const contentBox = await content.boundingBox();
    if (triggerBox === null || contentBox === null) {
      throw new LayoutAssumptionError(
        'Both the trigger and the open panel must report a bounding box.',
      );
    }

    // A couple of pixels of slack for Radix's own `sideOffset`/collision padding, not for the
    // overlap `item-aligned` used to produce (which reads as tens of pixels, the selected item
    // itself sitting inside the trigger's own box).
    expect(contentBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 2);
    expect(contentBox.width).toBe(triggerBox.width);
  });
});

/**
 * Items 7+10 (QA round 2): `ui/select.tsx`'s `SelectContent` used to default to Radix's
 * `item-aligned` positioning, which — as documented on `data-[align-trigger=true]:animate-none`
 * in that file — deliberately suppresses this same open/close animation, to overlay the selected
 * item on the trigger like a native `<select>` rather than animate in. Switching the default to
 * `popper` (matching `Popover`, which every other panel in the app already opens as) turns the
 * animation classes already written in that file on for the first time — this is what proves it,
 * the same way the Dialog pair above does for the family the brief actually named.
 */
test.describe('prefers-reduced-motion — a Radix open transition (Select)', () => {
  test('animates in at its designed duration with no preference emulated', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'one viewport is enough for a CSS-only check');

    await page.goto('/dev/composants');
    await page.locator('#ks-select').click();
    const content = page.locator('[data-slot="select-content"]');
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
    await page.locator('#ks-select').click();
    const content = page.locator('[data-slot="select-content"]');
    await content.waitFor({ state: 'visible' });

    const duration = await content.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(duration).toBe(REDUCED);
  });
});
