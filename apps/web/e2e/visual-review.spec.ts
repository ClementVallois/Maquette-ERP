import { expect, test } from '@playwright/test';

// frontend-plan.md rule 0bis.10: a screenshot for human review at the end of a significant
// visual task, stored under tests/visual/review/ (not gitignored, for human review — the .gitignore
// comment says so explicitly). The kitchen sink's own baseline (visual-baseline.spec.ts) only
// shows closed panels: Dialog, AlertDialog, Sheet, Popover, DropdownMenu and Select's content are
// all triggered, not open, in that screenshot, so the rounded-xl/shadow-overlay panel treatment
// (task 2.3's hand-fixes on the generated rounded-lg/shadow-md) has no visual evidence anywhere.
// This captures one open dialog to close that gap.
test('kitchen sink — a panel open, for the rounded-xl/shadow-overlay treatment', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one capture is enough to show the treatment');

  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvrir un dialog' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.screenshot({
    path: 'tests/visual/review/2.6-kitchen-sink-dialog-open.png',
    fullPage: false,
  });
});
