import { defineConfig, devices } from '@playwright/test';

// Dev topology (ADR-0063 §"Task 0.3"): Vite is the browser's origin, port 5173, proxying to the
// API on 3000. Phase 6's journeys are the first specs that need the API running for real rather
// than as a manual precondition documented in a spec's own header (`personas-live.spec.ts`,
// `shell.spec.ts`) — both `webServer` entries below start it and reset the database first.
const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const API_URL = 'http://127.0.0.1:3000';

const JOURNEYS_SPEC = '**/journeys.spec.ts';

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
      // Phase 2+ is taken against. Excludes the mutating journeys: `fullyParallel` runs every spec
      // file in its own worker, and the journeys share one seeded database in a fixed order
      // (Annexe B) — three simultaneous copies of J1 against one Cra would corrupt each other.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: JOURNEYS_SPEC,
    },
    {
      name: 'mobile-shell',
      // Secondary viewport, for the shell's responsive check (Phase 4.5's `Sheet` breakpoint) —
      // not exercised by Phase 1's smoke test, which runs on both projects regardless. Same
      // exclusion as `desktop`, same reason.
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
      testIgnore: JOURNEYS_SPEC,
    },
    {
      name: 'journeys',
      // The one project the mutating e2e journeys (Annexe B) run on: one worker, tests in file
      // order (`test.describe.configure({ mode: 'serial' })` inside the spec itself pins the
      // order within the file; `fullyParallel: false` here is what stops Playwright from handing
      // the file's own tests to more than one worker in the first place — the two settings answer
      // different questions and this project needs both). No retries: a retry would replay a
      // mutating step (Enregistrer, Soumettre) against a database the first, failed attempt
      // already changed, which is not the same test the second time.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: JOURNEYS_SPEC,
      fullyParallel: false,
      workers: 1,
      retries: 0,
    },
  ],
  // `pnpm run db:reset` is chained *inside* the API's own command, not a separate `globalSetup`
  // file: read against the installed package's own runner (`playwright/lib/runner/index.js`,
  // `createGlobalSetupTasks`), plugin setup — which is what starts `webServer` — runs *before*
  // any `globalSetup` file, not after. A `globalSetup` doing `db:reset` would therefore race an
  // already-started API's connection pool against `docker compose down -v` tearing the container
  // out from under it. Chaining inside the command is what actually gets the ordering this
  // phase's Gate needs: the database is reset and reseeded, then migrated, then the API starts
  // against the settled result — never the other way around.
  webServer: [
    {
      command: 'pnpm run db:reset && pnpm run api',
      cwd: '../..',
      url: `${API_URL}/readyz`,
      reuseExistingServer: !process.env['CI'],
      // `db:reset` (docker compose down -v, up --wait, migrate, seed) plus the API's own startup
      // comfortably clears Playwright's 60s default on a cold run.
      timeout: 120_000,
    },
    {
      command: 'pnpm run dev',
      url: BASE_URL,
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
