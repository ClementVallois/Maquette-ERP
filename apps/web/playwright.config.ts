import { defineConfig, devices } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3000';

/**
 * Which of ADR-0063's two topologies this run drives — the one thing about this file that is not
 * fixed, and the reason front-end plan Phase 9.6 exists.
 *
 * Unset (the default, and every local `pnpm --filter @erp/web exec playwright test`): the **dev**
 * topology. Vite on 5173 is the browser's origin and proxies to the API on 3000.
 *
 * `E2E_SERVED_BUILD=1`: the **prod/demo** topology. Vite is not started at all; the API serves
 * `apps/web/dist` on 3000, which is the only origin, and that build is what every spec runs
 * against. `routing.spec.ts` is written to hold in both — the plan's own words are that until this
 * mode is wired, task 9.1 is not verified, because the SPA fallback it added lives one layer below
 * the dev proxy the other topology exercises.
 */
const SERVED_BUILD = process.env['E2E_SERVED_BUILD'] === '1';

const BASE_URL = SERVED_BUILD ? API_URL : 'http://127.0.0.1:5173';

const JOURNEYS_SPEC = '**/journeys.spec.ts';

/** Drives its own viewport across four widths, so it belongs to exactly one project — see the
 * `responsive` project below and the spec's own header. */
const RESPONSIVE_SPEC = '**/responsive.spec.ts';

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
      testIgnore: [JOURNEYS_SPEC, RESPONSIVE_SPEC],
    },
    {
      name: 'mobile-shell',
      // Secondary viewport, for the shell's responsive check (Phase 4.5's `Sheet` breakpoint) —
      // not exercised by Phase 1's smoke test, which runs on both projects regardless. Same
      // exclusion as `desktop`, same reason.
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
      testIgnore: [JOURNEYS_SPEC, RESPONSIVE_SPEC],
    },
    {
      name: 'responsive',
      // No viewport here on purpose: `responsive.spec.ts` sets its own, four of them, and the
      // widths are part of what it asserts (375 / 768 / 1024 / 1440). Its own project so those
      // four runs happen once, not once per project — and so the two projects above, which are
      // pinned to a single width each, do not silently re-run it at the wrong one.
      use: { ...devices['Desktop Chrome'] },
      testMatch: RESPONSIVE_SPEC,
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
  //
  // In CI there is no `docker compose` to reset: Postgres is a service container, and the
  // workflow's own steps create the app role, migrate and seed before Playwright is invoked —
  // exactly as the `test-integration` job does. `db:reset` is therefore chained only when `CI` is
  // unset. This is the same split the `.github/workflows/ci.yml` `web-e2e` job documents on its
  // own side; the two are one arrangement written in two files.
  webServer: SERVED_BUILD
    ? [
        {
          // One server, no Vite: the API serves `apps/web/dist` on 3000 and is the only origin
          // (front-end plan Phase 9.6). The build is chained in rather than left to the caller —
          // a `dist/` older than the sources is precisely the failure this Gate exists to catch,
          // and it would pass silently against a stale one.
          command: `${process.env['CI'] ? '' : 'pnpm run db:reset && '}pnpm --filter @erp/web build && pnpm run api`,
          cwd: '../..',
          url: `${API_URL}/readyz`,
          // `API_PUBLIC_ORIGIN` must be the **browser's** origin, which is 3000 here and 5173 in
          // the dev topology — and the local `.env` carries the dev value. Node's `--env-file`
          // (`pnpm run api`) does not override a variable already in the environment, so setting
          // it here wins over that file without editing it. Get this wrong and every write in
          // `journeys.spec.ts` answers 403 `/problems/forbidden-origin` (ADR-0023).
          env: { API_PUBLIC_ORIGIN: API_URL },
          // Never reuse: a server already running is, on a developer's machine, the *dev*
          // topology's API — same port, wrong `API_PUBLIC_ORIGIN`, and possibly no `dist` at all.
          reuseExistingServer: false,
          // The web build is a Vite production build on top of everything the dev-topology
          // command already does.
          timeout: 240_000,
        },
      ]
    : [
        {
          command: `${process.env['CI'] ? '' : 'pnpm run db:reset && '}pnpm run api`,
          cwd: '../..',
          url: `${API_URL}/readyz`,
          reuseExistingServer: !process.env['CI'],
          // `db:reset` (docker compose down -v, up --wait, migrate, seed) plus the API's own
          // startup comfortably clears Playwright's 60s default on a cold run.
          timeout: 120_000,
        },
        {
          command: 'pnpm run dev',
          url: BASE_URL,
          reuseExistingServer: !process.env['CI'],
        },
      ],
});
