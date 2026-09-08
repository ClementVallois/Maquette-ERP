import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { CraGridResponse } from '../src/features/cra/types';

const days: CraGridResponse['days'] = Array.from({ length: 31 }, (_, index) => {
  const date = `2026-07-${String(index + 1).padStart(2, '0')}`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return {
    date,
    nonWorkable:
      date === '2026-07-14' ? 'publicHoliday' : weekday === 0 || weekday === 6 ? 'weekend' : null,
  };
});
const alpha = 'Audit de sécurité et accompagnement des équipes opérationnelles';
const grid: CraGridResponse = {
  period: '2026-07',
  craId: null,
  status: null,
  days,
  missions: [
    {
      missionId: 'alpha',
      name: alpha,
      clientName: 'Client A',
      assignableDays: days.filter((day) => day.date !== '2026-07-03').map((day) => day.date),
    },
    {
      missionId: 'beta',
      name: 'Mission B',
      clientName: 'Client B',
      assignableDays: days.map((day) => day.date),
    },
  ],
  lines: [],
  flags: [],
  refusal: null,
  editable: true,
  validatedBy: null,
  timeline: [],
};

async function openGrid(page: Page, overrides: Partial<CraGridResponse> = {}): Promise<void> {
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      json: {
        persona: {
          key: 'consultant-paris',
          role: 'consultant',
          displayName: 'Alice Martin',
          office: 'Paris',
        },
      },
    }),
  );
  await page.route('**/api/v1/cras/2026-07/grid', (route) =>
    route.fulfill({ json: { ...grid, ...overrides } }),
  );
  await page.goto('/cra/2026-07');
  await expect(page.locator('[data-cra-day-cards]')).toBeVisible();
}

function dayCard(page: Page, date: string) {
  return page
    .locator('[data-cra-day-cards] details')
    .filter({ has: page.getByLabel(`Total du jour — ${date}`, { exact: true }) });
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'this suite drives its own mobile viewport');
  await page.setViewportSize({ width: 360, height: 760 });
});

test('week fill adds a mission, preserves exceptions and supports undo without touching other weeks', async ({
  page,
}) => {
  await openGrid(page, {
    lines: [
      { day: '2026-07-02', dayType: 'absence', missionId: null, quarterDays: 2 },
      { day: '2026-07-03', dayType: 'worked', missionId: 'beta', quarterDays: 4 },
    ],
  });
  const fill = page.getByRole('button', { name: 'Remplir cette semaine', exact: true });
  await expect(page.getByLabel('Activité à remplir')).toHaveValue('alpha');
  await expect(page.getByRole('status').filter({ hasText: 'jour à remplir' })).toHaveText(
    '1 jour à remplir',
  );
  await fill.click();
  await expect(fill).toBeDisabled();
  await expect(page.getByLabel('Activité à remplir')).toHaveValue('alpha');
  await expect(dayCard(page, '01/07/2026')).not.toHaveAttribute('open');
  await expect(dayCard(page, '01/07/2026').locator('summary')).toContainText(alpha);
  await expect(
    dayCard(page, '02/07/2026').getByRole('combobox', { name: 'Absence — 02/07/2026' }),
  ).toHaveValue('2');
  await expect(dayCard(page, '04/07/2026').locator('summary')).toContainText('0 j');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(
    dayCard(page, '06/07/2026').getByRole('combobox', { name: `${alpha} — 06/07/2026` }),
  ).toHaveValue('0');
  await page.getByRole('button', { name: /^Annuler : Remplir cette semaine/u }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Semaine précédente' }).click();
  await expect(dayCard(page, '01/07/2026')).toHaveAttribute('open');
  await expect(
    dayCard(page, '01/07/2026').getByRole('combobox', { name: `${alpha} — 01/07/2026` }),
  ).toHaveCount(0);
  await expect(
    dayCard(page, '02/07/2026').getByRole('combobox', { name: 'Absence — 02/07/2026' }),
  ).toHaveValue('2');
  await fill.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole('table').getByRole('combobox', { name: `${alpha} — 01/07/2026` }),
  ).toHaveValue('4');
  await expect(
    page.getByRole('table').getByRole('combobox', { name: `${alpha} — 03/07/2026` }),
  ).toHaveCount(0);
});

test('fill skips holidays and unavailable dates, keeps its activity, and stays usable at 360px', async ({
  page,
}) => {
  await openGrid(page);
  const fill = page.getByRole('button', { name: 'Remplir cette semaine', exact: true });
  await fill.click();
  await expect(dayCard(page, '03/07/2026').locator('summary')).toContainText('0 j');
  await expect(fill).toBeDisabled();
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await expect(page.getByLabel('Activité à remplir')).toHaveValue('alpha');
  await fill.click();
  await expect(dayCard(page, '14/07/2026')).not.toHaveAttribute('open');
  await expect(dayCard(page, '14/07/2026').locator('summary')).toContainText('Férié');
  await expect(dayCard(page, '14/07/2026').locator('summary')).toContainText('0 j');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '6');
  expect(
    (await page.getByLabel('Activité à remplir').boundingBox())?.height,
  ).toBeGreaterThanOrEqual(44);
  await page.getByLabel('Activité à remplir').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('mobile-week-filled.png') });
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('completed cards reopen by keyboard and completing an edit keeps focus and disclosure state', async ({
  page,
}) => {
  await openGrid(page);
  await page.getByRole('button', { name: 'Remplir cette semaine', exact: true }).click();
  const day = dayCard(page, '01/07/2026');
  const summary = day.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  const cell = day.getByRole('combobox', { name: `${alpha} — 01/07/2026` });
  await cell.focus();
  await cell.selectOption('2');
  await expect(cell).toBeFocused();
  await cell.selectOption('4');
  await expect(cell).toBeFocused();
  await expect(day).toHaveAttribute('open');
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await page.getByRole('button', { name: 'Semaine précédente' }).click();
  await expect(day).toHaveAttribute('open');
  await summary.click();
  await expect(day).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await page.getByRole('button', { name: 'Semaine précédente' }).click();
  await expect(day).not.toHaveAttribute('open');
});

test('empty-month prompt uses the existing copy preview and its undo', async ({ page }) => {
  await page.route('**/api/v1/cras/2026-06/grid', (route) =>
    route.fulfill({
      json: {
        ...grid,
        period: '2026-06',
        lines: [{ day: '2026-06-01', dayType: 'worked', missionId: 'alpha', quarterDays: 4 }],
      },
    }),
  );
  await openGrid(page);
  await expect(page.getByText('Reprendre les missions de juin 2026 ?')).toBeVisible();
  await page.getByRole('button', { name: 'Voir la proposition' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(alpha);
  await expect(page.getByRole('progressbar', { includeHidden: true })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByText('Le mois est vide', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voir la proposition' }).click();
  await dialog.getByRole('button', { name: 'Copier', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '21');
  await expect(page.getByText('Le mois est vide', { exact: true })).toHaveCount(0);
  await expect(dayCard(page, '01/07/2026')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Annuler : Copier le mois précédent' }).click();
  await expect(page.getByText('Le mois est vide', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('submission sends the month matrix and missing-day navigation opens a collapsed day in another week', async ({
  page,
}) => {
  await openGrid(page);
  await page.getByRole('button', { name: 'Remplir cette semaine', exact: true }).click();
  await page.getByRole('button', { name: 'Semaine suivante' }).click();
  await dayCard(page, '06/07/2026').locator('summary').click();
  await expect(dayCard(page, '06/07/2026')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: 'Semaine précédente' }).click();
  await page.route('**/api/v1/cras/2026-07/entries', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/problem+json',
      json: {
        type: '/problems/cra-incomplete',
        title: 'IncompleteCraError',
        status: 422,
        detail: 'Incomplete month',
        errors: { missingDays: ['["2026-07-06"]'] },
      },
    }),
  );
  const request = page.waitForRequest('**/api/v1/cras/2026-07/entries');
  await page.getByRole('button', { name: 'Soumettre au manager', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({
    submit: true,
    entries: [
      { day: '2026-07-01', dayType: 'worked', missionId: 'alpha', quarterDays: 4 },
      { day: '2026-07-02', dayType: 'worked', missionId: 'alpha', quarterDays: 4 },
    ],
  });
  await page.getByRole('button', { name: 'Aller au premier jour incomplet' }).click();
  await expect(dayCard(page, '06/07/2026')).toHaveAttribute('open');
  await expect(
    dayCard(page, '06/07/2026').getByRole('combobox', { name: `${alpha} — 06/07/2026` }),
  ).toBeFocused();
});

test('the mobile row tools clear a row and only then let it be removed', async ({ page }) => {
  await openGrid(page, {
    lines: [{ day: '2026-07-01', dayType: 'worked', missionId: 'alpha', quarterDays: 4 }],
  });
  await page.getByRole('button', { name: 'Gérer les lignes de la grille' }).click();
  const remove = page.getByRole('button', { name: `Retirer la ligne — ${alpha}` });
  const clear = page.getByRole('button', { name: `Vider la ligne — ${alpha}` });

  // The rule the desktop row tools hold by hiding the button: a row is removable only once it
  // carries nothing across the whole month, and Absence is never removable at all.
  await expect(remove).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retirer la ligne — Absence' })).toHaveCount(0);
  await clear.click();
  await expect(remove).toBeEnabled();
  await expect(clear).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

  await remove.click();
  await expect(clear).toHaveCount(0);
  await dayCard(page, '01/07/2026').locator('summary').click();
  await expect(
    dayCard(page, '01/07/2026').getByRole('combobox', { name: `${alpha} — 01/07/2026` }),
  ).toHaveCount(0);
  // Removed from the grid, so it is offerable again — the mobile add control is the same one the
  // desktop uses, widened rather than duplicated.
  await expect(page.getByRole('combobox', { name: 'Ajouter une activité' })).toBeVisible();
});

test('keeping local edits dismisses an acknowledged remote refresh until newer data arrives', async ({
  page,
}) => {
  let remoteGrid = grid;
  await page.route('**/api/v1/session', (route) =>
    route.fulfill({
      json: {
        persona: {
          key: 'consultant-paris',
          role: 'consultant',
          displayName: 'Alice Martin',
          office: 'Paris',
        },
      },
    }),
  );
  await page.route('**/api/v1/cras/2026-07/grid', (route) => route.fulfill({ json: remoteGrid }));
  await page.goto('/cra/2026-07');
  const absence = page
    .locator('[data-cra-day-cards]')
    .getByRole('combobox', { name: 'Absence — 01/07/2026', exact: true });
  await absence.selectOption('4');
  await page.getByRole('button', { name: 'Semaine suivante', exact: true }).click();
  const previousWeek = page.getByRole('button', { name: 'Semaine précédente', exact: true });
  await expect(previousWeek).toBeEnabled();

  remoteGrid = {
    ...grid,
    timeline: [{ kind: 'submitted', at: '2026-07-02T09:00:00.000Z', actorName: 'Alice Martin' }],
  };
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'erp:persona-changed-at' }));
  });

  const conflict = page.getByText('Des données plus récentes sont arrivées du serveur', {
    exact: true,
  });
  await expect(conflict).toBeVisible();
  await page.getByRole('button', { name: 'Garder mes modifications', exact: true }).click();
  await expect(conflict).toBeHidden();
  await expect(previousWeek).toBeEnabled();
  await previousWeek.click();
  await expect(absence).toHaveValue('4');

  remoteGrid = {
    ...remoteGrid,
    timeline: [
      ...remoteGrid.timeline,
      { kind: 'submitted', at: '2026-07-03T09:00:00.000Z', actorName: 'Alice Martin' },
    ],
  };
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'erp:persona-changed-at' }));
  });
  await expect(conflict).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Recharger la version du serveur (perdre mes modifications)',
      exact: true,
    })
    .click();
  await expect(conflict).toBeHidden();
  await expect(absence).toHaveValue('0');
});

test('read-only CRA exposes complete summaries and errors without editing tools', async ({
  page,
}) => {
  await openGrid(page, {
    editable: false,
    status: 'submitted',
    lines: [
      { day: '2026-07-01', dayType: 'worked', missionId: 'alpha', quarterDays: 4 },
      { day: '2026-07-02', dayType: 'worked', missionId: 'alpha', quarterDays: 4 },
      { day: '2026-07-02', dayType: 'absence', missionId: null, quarterDays: 1 },
    ],
  });
  await expect(page.getByRole('button', { name: 'Remplir cette semaine' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voir la proposition' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gérer les lignes de la grille' })).toHaveCount(0);
  // The week navigator is not editing, so it stays: a submitted month is still read week by week.
  await expect(page.getByRole('button', { name: 'Semaine suivante' })).toBeVisible();
  await expect(dayCard(page, '01/07/2026')).not.toHaveAttribute('open');
  await dayCard(page, '01/07/2026').locator('summary').click();
  await expect(dayCard(page, '01/07/2026')).toContainText(alpha);
  await expect(dayCard(page, '02/07/2026')).toHaveAttribute('open');
  await expect(dayCard(page, '02/07/2026')).toContainText('Ce jour dépasse une journée complète');
  await expect(page.locator('[data-cra-day-cards]').getByRole('combobox')).toHaveCount(0);
});
