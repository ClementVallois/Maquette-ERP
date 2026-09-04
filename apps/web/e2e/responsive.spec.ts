import { expect, test, type Page } from '@playwright/test';

/**
 * Items 34 and 35, QA round 3 — and the only thing that stops either from coming back.
 *
 * The shell is one fixed-size box (`routes/_shell.tsx`: `h-dvh overflow-hidden`) with `<main>` as
 * the app's single scrollport. Two invariants follow, and both were broken on every screen before
 * this round:
 *
 * 1. **The document never scrolls, on either axis.** It is `h-dvh`; there is nothing for it to
 *    scroll. `sr-only` is `position: absolute`, and until `<main>` was made a containing block
 *    every screen-reader-only caption and label resolved against the initial containing block and
 *    was never clipped — `/pre-facturier` at 375px reported a 2545px document against an 812px
 *    viewport, and scrolling past the end of `main` kept going into blank space.
 * 2. **`<main>` never scrolls sideways.** Wide content scrolls inside its own `overflow-x-auto`
 *    container — the CRA month grid, a `DataTable` — never by panning the page. `main` computes
 *    `overflow-x: auto` (a consequence of its `overflow-y-auto`), so a violation shows up here as
 *    a horizontally scrollable shell rather than as a scrollable document.
 *
 * Both halves are load-bearing and neither implies the other. `cra-matrix-table.tsx`'s own
 * `relative` and `<main>`'s each fix a different escape: with only the shell's, the CRA grid's
 * table would be contained *into `main`*, and `main` would pan sideways instead of the document —
 * invariant 1 would pass and invariant 2 would fail. A document-only check would have called
 * Affectations and the CRA progress bar clean at 375px while both were broken.
 *
 * Widths are driven here rather than by a Playwright project: 375 is the phone this round was
 * reported from, 768 is `md` (where `cra-grid-screen.tsx` swaps its compact mobile matrix for the
 * full month, ~1509px of min-content), 1024 is `lg` (where the sidebar and the breadcrumb appear),
 * 1440 is the primary viewport every screenshot is taken against. Three of this round's four
 * overflow defects were invisible at the 768 the `mobile-shell` project uses.
 *
 * Read-only: every route below is a GET, so this spec is safe to run in parallel with the others,
 * unlike the mutating journeys.
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

const WIDTHS = [375, 768, 1024, 1440] as const;

/**
 * Every screen reachable without writing anything, per persona. The two parameterised routes are
 * reached by clicking a real link rather than by pasting an id: `/factures/:id` needs one that
 * exists and `/cra/:period/:consultantId` needs one this manager may read, and both carry query
 * parameters (`?from=`, `?client=`) that change what the page renders.
 */
const ROUTES: readonly (readonly [persona: string, routes: readonly string[]])[] = [
  [
    'consultant-paris',
    ['/tableau-de-bord', '/cra', '/cra/2026-06', '/mes-informations', '/mes-notes-de-frais'],
  ],
  ['manager-paris', ['/tableau-de-bord', '/cra', '/pre-facturier', '/affectations', '/factures']],
  ['billing-paris', ['/tableau-de-bord', '/factures', '/pre-facturier']],
];

interface Metrics {
  readonly documentScrollWidth: number;
  readonly documentClientWidth: number;
  readonly documentScrollHeight: number;
  readonly documentClientHeight: number;
  readonly mainScrollWidth: number;
  readonly mainClientWidth: number;
  readonly mainScrollHeight: number;
  readonly mainClientHeight: number;
  /** The bottom edge of the lowest laid-out element inside `main`, in `main`'s scroll coordinates.
   *  Fractional: it is a `getBoundingClientRect()` edge, and the assertion below carries a 1px
   *  tolerance rather than rounding it away. */
  readonly mainContentBottom: number;
  /**
   * The widest element reaching past `main`'s client width, named so a failure points at markup
   * instead of at a number. **Diagnostic, not an assertion**: content wider than the viewport is
   * legitimate *inside its own* `overflow-x-auto` container — a `DataTable`'s table is routinely
   * 1261px inside a 1192px shell and is perfectly contained. What is never legitimate is `main`
   * itself scrolling sideways, which is what the assertions below check.
   */
  readonly widestEscape: string | null;
}

class ShellMarkupError extends Error {}

async function measure(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    // Declared inside the callback: this function is serialised and run in the browser, so it
    // cannot close over a class declared in this file.
    class MissingShellError extends Error {}

    const main = document.querySelector('main');
    if (main === null) throw new MissingShellError('the shell always renders a <main>.');

    const root = document.documentElement;
    const mainBox = main.getBoundingClientRect();

    let contentBottom = 0;
    let widest: { right: number; description: string } | null = null;
    for (const element of main.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      // A fixed element is positioned against the viewport, not against `main`'s scroll content —
      // including it would report the sticky action bar as content beyond the scroll height.
      if (getComputedStyle(element).position === 'fixed') continue;

      contentBottom = Math.max(contentBottom, box.bottom - mainBox.top + main.scrollTop);
      const right = box.right - mainBox.left + main.scrollLeft;
      if (right > main.clientWidth + 1 && (widest === null || right > widest.right)) {
        widest = {
          right,
          // `getAttribute`, not `.className`: on an SVG element that property is an
          // `SVGAnimatedString`, which stringifies to `[object SVGAnimatedString]`.
          description: `<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}"> reaches ${right.toFixed(0)}px`,
        };
      }
    }

    return {
      documentScrollWidth: root.scrollWidth,
      documentClientWidth: root.clientWidth,
      documentScrollHeight: root.scrollHeight,
      documentClientHeight: root.clientHeight,
      mainScrollWidth: main.scrollWidth,
      mainClientWidth: main.clientWidth,
      mainScrollHeight: main.scrollHeight,
      mainClientHeight: main.clientHeight,
      mainContentBottom: contentBottom,
      widestEscape: widest?.description ?? null,
    };
  });
}

async function expectContained(page: Page, where: string): Promise<void> {
  const metrics = await measure(page);

  const culprit = metrics.widestEscape === null ? '' : ` — widest: ${metrics.widestEscape}`;

  expect(
    metrics.mainScrollWidth,
    `${where}: <main> pans sideways, so something wide is not inside its own scroll container${culprit}`,
  ).toBeLessThanOrEqual(metrics.mainClientWidth);
  expect(
    metrics.documentScrollWidth,
    `${where}: the document pans sideways, but the shell is h-dvh overflow-hidden${culprit}`,
  ).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(
    metrics.documentScrollHeight,
    `${where}: the document scrolls vertically, but the shell is h-dvh`,
  ).toBeLessThanOrEqual(metrics.documentClientHeight);

  // Item 35's literal report — scrolling "lower than the page provides". Only meaningful on a page
  // that scrolls at all: one shorter than the viewport has slack by definition, not blank space
  // below its own end.
  if (metrics.mainScrollHeight > metrics.mainClientHeight) {
    expect(
      metrics.mainScrollHeight - metrics.mainContentBottom,
      `${where}: blank space below the last element in <main>`,
    ).toBeLessThanOrEqual(1);
  }
}

async function choosePersona(page: Page, personaKey: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

/** The page is settled when the shell has stopped showing a skeleton for the route's own data. */
async function settle(page: Page): Promise<void> {
  await page.locator('main').waitFor({ state: 'visible' });
  // `data-slot="skeleton"`, the attribute `components/ui/skeleton.tsx` stamps on every placeholder
  // — measuring a skeleton measures the placeholder's layout, not the page's.
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0);
}

for (const width of WIDTHS) {
  test.describe(`nothing overflows the shell at ${String(width)}px`, () => {
    test.use({ viewport: { width, height: 812 } });

    for (const [persona, routes] of ROUTES) {
      test(`${persona}: ${routes.join(', ')}`, async ({ page }) => {
        await choosePersona(page, persona);

        for (const route of routes) {
          await page.goto(route);
          await settle(page);
          await expectContained(page, `${String(width)}px ${persona} ${route}`);
        }
      });
    }
  });

  test.describe(`the two parameterised screens at ${String(width)}px`, () => {
    test.use({ viewport: { width, height: 812 } });

    test('an invoice, opened from the list it belongs to', async ({ page }) => {
      await choosePersona(page, 'billing-paris');
      await page.goto('/factures');
      await settle(page);

      const link = page.locator('a[href^="/factures/"]').first();
      if ((await link.count()) === 0) {
        throw new ShellMarkupError('the invoice list always links to at least one invoice.');
      }
      await link.click();
      await page.waitForURL(/\/factures\/[^/]+/u);
      await settle(page);

      await expectContained(page, `${String(width)}px billing-paris /factures/:id`);
    });

    test('a consultant’s month, opened by their own manager', async ({ page }) => {
      await choosePersona(page, 'manager-paris');
      await page.goto('/cra');
      await settle(page);

      const link = page.locator('a[href^="/cra/"]').first();
      if ((await link.count()) === 0) {
        throw new ShellMarkupError('the manager CRA list always links to at least one month.');
      }
      await link.click();
      await page.waitForURL(/\/cra\/\d{4}-\d{2}/u);
      await settle(page);

      await expectContained(page, `${String(width)}px manager-paris /cra/:period/:consultantId`);
    });
  });
}
