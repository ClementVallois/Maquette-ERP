import { defineConfig, devices } from '@playwright/test';

// Dev topology (ADR-0063 §"Task 0.3"): Vite is the browser's origin, port 5173. The smoke test
// in Phase 1 never calls the API, so no second process is needed to make it meaningful; Phase 6's
// e2e journeys are the ones that will need `pnpm run api:dev` running alongside this.
const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  // Playwright's default output directories (`test-results/`, `playwright-report/`) land under
  // `tests/visual/` instead, per frontend-plan.md Phase 1.5 — one place for every Playwright
  // artefact, gitignored and prettier-ignored as a whole rather than by default-name guesswork.
  outputDir: './tests/visual/test-results',
  reporter: [['html', { outputFolder: './tests/visual/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      // Primary viewport (frontend-plan.md Phase 1.5): 1440 wide, the width every screenshot in
      // Phase 2+ is taken against.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-shell',
      // Secondary viewport, for the shell's responsive check (Phase 4.5's `Sheet` breakpoint) —
      // not exercised by Phase 1's smoke test, which runs on both projects regardless.
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
  ],
  webServer: {
    command: 'pnpm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
  },
});
