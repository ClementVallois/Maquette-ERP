import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** `no-restricted-syntax` bans a bare `new Error()` project-wide, tests included — same local
 * pattern as `motion.spec.ts`'s own `LayoutAssumptionError`. */
class LayoutAssumptionError extends Error {}

async function choosePersona(page: Page, key: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${key}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

async function expectAccessible(page: Page): Promise<void> {
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([]);
}

test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'this suite drives its own phone and desktop viewports',
  );
  await page.setViewportSize({ width: 360, height: 760 });
});

test('persona selection stays steady until the destination session has loaded', async ({
  page,
}) => {
  let releaseSession: (() => void) | undefined;
  const sessionGate = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  let sessionRequested = false;
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/session/persona')) writes++;
  });
  await page.route('**/api/v1/session', async (route) => {
    sessionRequested = true;
    await sessionGate;
    await route.continue();
  });
  await page.goto('/');
  const card = page.locator('[data-persona-key="consultant-paris"] button');
  await card.click();
  await expect.poll(() => sessionRequested).toBe(true);
  await expect(card).toBeDisabled();
  await expect(card).toHaveAttribute('aria-busy', 'true');
  await expect(card).toHaveCSS('opacity', '1');
  await expect(card).toHaveCSS('cursor', 'progress');
  await card.evaluate((button: HTMLButtonElement) => {
    button.click();
  });
  expect(writes).toBe(1);
  releaseSession?.();
  await page.waitForURL('/tableau-de-bord');
});

test('a failed persona request restores the cards for retry', async ({ page }) => {
  await page.route('**/api/v1/session/persona', (route) => route.abort());
  await page.goto('/');
  const card = page.locator('[data-persona-key="consultant-paris"] button');
  await card.click();
  await expect(page.getByText('Le persona n’a pas pu être choisi. Réessayez.')).toBeVisible();
  await expect(card).toBeEnabled();
  await page.unroute('**/api/v1/session/persona');
  await card.click();
  await page.waitForURL('/tableau-de-bord');
});

test('mobile day quantities survive week navigation and the desktop layout', async ({ page }) => {
  await choosePersona(page, 'consultant-paris');
  await page.goto('/cra/2026-12');
  const cards = page.locator('[data-cra-day-cards]');
  const cell = cards.getByRole('combobox', { name: 'Absence — 01/12/2026', exact: true });
  await cell.selectOption('2');
  await expect(cell).toHaveValue('2');
  await expect(cards.getByLabel('Total du jour — 01/12/2026', { exact: true })).toHaveText('0,5 j');
  const box = await cell.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await page.getByRole('button', { name: 'Semaine précédente' }).click();
  await expect(cell).toHaveValue('2');
  const weekend = cards.locator('details').filter({ hasText: 'samedi 05' });
  await weekend.locator('summary').click();
  await weekend.getByRole('combobox').focus();
  await weekend.getByRole('combobox').selectOption('1');
  await expect(weekend.getByRole('combobox')).toBeFocused();
  await expect(cards.getByRole('combobox', { name: 'Absence — 05/12/2026' })).toHaveValue('1');
  await expectAccessible(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole('table').getByRole('combobox', { name: 'Absence — 01/12/2026', exact: true }),
  ).toHaveValue('2');
});

for (const width of [360, 1440]) {
  test(`assignment search and date editing work at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 760 : 900 });
    await choosePersona(page, 'manager-paris');
    await page.goto('/affectations');

    // The consultant picker (task: one searchable combobox replacing the previous pair — a
    // standalone search box filtering a separate native `<select>`): open it, search, pick.
    const trigger = page.getByRole('button', { name: /^Consultant/u });
    await trigger.click();
    const panel = page.locator('[data-slot="popover-content"]');
    const search = panel.getByRole('textbox', { name: 'Rechercher un consultant' });
    await search.fill('alice');
    await expect(panel.getByRole('button')).toHaveCount(1);
    await panel.getByRole('button', { name: 'Alice Martin' }).click();
    // Selecting closes the popover and the trigger itself now reads the chosen name.
    await expect(panel).toBeHidden();
    await expect(trigger).toHaveText('Alice Martin');

    // Reopening and searching for something that matches nothing still keeps the current
    // selection present and visible — the special case the previous native `<select>` handled
    // with a synthetic extra `<option>`.
    await trigger.click();
    await search.fill('no-such-consultant');
    await expect(panel.getByText('Aucun consultant', { exact: false })).toBeVisible();
    await expect(trigger).toHaveText('Alice Martin');
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    await page
      .getByRole('button', { name: /Modifier l’affectation de/u })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Modifier les dates', exact: true }),
    ).toBeInViewport();
    // Edit mode shows the consultant read-only (a `<dl>`), not the combobox at all.
    await expect(page.getByRole('button', { name: /^Consultant/u })).toHaveCount(0);
    await expect(page.getByLabel('Du', { exact: true })).not.toHaveValue('');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Annuler la modification' }).click();
    await expect(page.getByRole('button', { name: /^Consultant/u })).toHaveText(
      'Choisir un consultant…',
    );
    await expect(page.getByLabel('Du', { exact: true })).toHaveValue('');
  });
}

test('manager day cards are read-only and the timeline joins dot centres', async ({ page }) => {
  await choosePersona(page, 'manager-paris');
  await page.goto('/cra?period=2026-08');
  await page.locator('a[href^="/cra/2026-"]').first().click();
  const cards = page.locator('[data-cra-day-cards]');
  await expect(cards).toBeVisible();
  await expect(cards.getByRole('combobox')).toHaveCount(0);
  // Pinned to a named workday, the way the weekend assertion above is pinned to 'samedi 05', and
  // for the same reason: day cards are `<details>` for *every* day now, not only the non-workable
  // ones, so `.first()` is Saturday the 1st — a weekend at 0 j. This line read `article` when
  // `<article>` alone meant "workable day"; renaming the tag kept the syntax and lost the meaning.
  await expect(cards.locator('details').filter({ hasText: 'lundi 03' })).toContainText('1 j');
  await expectAccessible(page);
  const timeline = page
    .locator('ol:visible')
    .filter({ has: page.getByText('CRA validé', { exact: true }) });
  const geometry = await timeline
    .locator('li')
    .first()
    .evaluate((item) => {
      const line = item.querySelector(':scope > span:first-child')?.getBoundingClientRect();
      const dot = item.querySelector(':scope > span:nth-child(2)')?.getBoundingClientRect();
      return {
        lineX: line === undefined ? -100 : line.x + line.width / 2,
        dotX: dot === undefined ? 100 : dot.x + dot.width / 2,
      };
    });
  expect(Math.abs(geometry.lineX - geometry.dotX)).toBeLessThanOrEqual(0.5);
});

test('mobile persona metadata and empty-month actions align', async ({ page }) => {
  await choosePersona(page, 'manager-paris');
  await page.getByRole('button', { name: 'Persona en cours : Bruno Leroy' }).click();
  const menu = page.getByRole('menu');
  // `[data-persona-value]` (`persona-block.tsx`), not `dd` — this panel is a `grid`, not a `dl`.
  // `.locator('dd')` matched nothing, so `evaluateAll` returned `[]` and `expect(undefined).toBe
  // (undefined)` passed regardless of whether the two columns actually lined up: the one
  // assertion covering the persona panel's grid-column fix was proving nothing.
  const lefts = await menu
    .locator('[data-persona-value]')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().left));
  expect(lefts).toHaveLength(2);
  expect(lefts[0]).toBe(lefts[1]);
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  const card = page
    .locator('main div')
    .filter({ has: page.getByText('Ce mois ne contient aucune donnée', { exact: false }) })
    .last();
  const links = card.locator('a');
  await expect(links).toHaveCount(3);
  const boxes = await links.evaluateAll((items) =>
    items.map((item) => ({
      x: item.getBoundingClientRect().x,
      width: item.getBoundingClientRect().width,
    })),
  );
  expect(boxes.every((box) => box.x === boxes[0]?.x && box.width === boxes[0].width)).toBe(true);
});

test('saving a CRA uses a steady busy button and recovers after a failed request', async ({
  page,
}) => {
  await choosePersona(page, 'consultant-paris');
  await page.goto('/cra/2026-12');
  await page
    .locator('[data-cra-day-cards]')
    .getByRole('combobox', { name: 'Absence — 01/12/2026', exact: true })
    .selectOption('4');
  let releaseWrite: (() => void) | undefined;
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  await page.route('**/api/v1/cras/2026-12/entries', async (route) => {
    await writeGate;
    await route.abort();
  });
  const save = page.getByRole('button', { name: 'Enregistrer', exact: true });
  await save.click();
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await expect(save).toBeDisabled();
  await expect(save).toHaveCSS('opacity', '1');
  await expect(save).toHaveCSS('cursor', 'progress');
  releaseWrite?.();
  await expect(save).toBeEnabled();
  await expect(
    page
      .locator('[data-cra-day-cards]')
      .getByRole('combobox', { name: 'Absence — 01/12/2026', exact: true }),
  ).toHaveValue('4');
});

test('a horizontal drag across a table row does not navigate, but a tap does', async ({ page }) => {
  await choosePersona(page, 'billing-paris');
  await page.goto('/factures');
  const row = page.locator('table tbody tr').first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  if (box === null)
    throw new LayoutAssumptionError('The first invoice row must have a bounding box.');
  const y = box.y + box.height / 2;
  // Over the first (non-interactive) cell — not the "Ouvrir" link, which lives in the last one.
  const startX = box.x + 12;

  const urlBeforeDrag = page.url();
  // The row's own wrapper (`components/ui/table.tsx`) scrolls horizontally on mobile — a
  // drag-scroll across a row must not be read as a tap.
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 80, y, { steps: 8 });
  await page.mouse.up();
  expect(page.url()).toBe(urlBeforeDrag);
  // The drag above dragged a real, desktop-only text selection along with it (mouse behaviour a
  // touch drag does not have) — clear it so the independent tap below is not itself gated by the
  // "non-empty selection" bail this component's `pointerup` handler also checks.
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
  });

  // A tap in the same place, no movement, does activate the row.
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForURL(/\/factures\/[^/?]+/u);
});

test('invoice source dates expand into a contained grid without losing days', async ({ page }) => {
  await choosePersona(page, 'billing-paris');
  await page.goto('/factures');
  await page.locator('a[href^="/factures/"]').first().click();
  const summary = page.locator('summary').filter({ hasText: 'dates travaillées' }).first();
  await expect(summary).toBeVisible();
  const text = await summary.innerText();
  const count = Number.parseInt(text, 10);
  const dates = summary.locator('..').locator('time');
  await expect(dates.first()).toBeHidden();
  await summary.click();
  await expect(dates).toHaveCount(count);
  await expect(dates.first()).toBeVisible();
  const main = await page
    .locator('main')
    .evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(main.scroll).toBe(main.client);
  await expectAccessible(page);
});
