import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The `@/` alias apps/web/src's own code already uses throughout (`apps/web/vite.config.ts`,
  // `apps/web/tsconfig.json`'s `paths`, `.dependency-cruiser.cjs`'s `tsConfig`) — Vitest is a
  // fourth tool that resolves imports on its own, and had never needed to teach itself this alias
  // because no test, before Phase 4, imported a module that used it. `navigation.ts` and
  // `session-guard.ts` (Phase 4) are the first: their own `@/lib/...` imports failed to resolve
  // under the plain `vitest run` this root config drives, with no failure anywhere else — Vite's
  // dev server and build both already resolve it (they load `apps/web/vite.config.ts`'s own
  // alias), so the gap was invisible until a unit test reached one of these modules directly.
  // Scoped to the literal `@` key exactly as `apps/web/vite.config.ts` does: Vite/Vitest's alias
  // matcher treats a bare key as an exact-or-slash-prefixed match, so `@erp/contracts` (no slash
  // after `@`) is untouched — confirmed by the existing `@erp/*` workspace imports passing
  // unchanged after this was added.
  //
  // Declared twice: once here at the root (read by anything that loads this file directly, e.g.
  // `vitest --ui`) and once inside the `unit` project below. `test.projects` entries are each a
  // near-standalone inline config — verified directly: a root-only `resolve.alias` here left
  // `@/lib/labels` unresolved inside the `unit` project until the same block was duplicated into
  // that project's own object, so the per-project copy is load-bearing, not defensive.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
          },
        },
        test: {
          name: 'unit',
          // `apps/**` is in this list and its absence was a gate that had stopped looking: the
          // integration project already named `apps/**/*.int.test.ts`, so a unit test written in
          // `apps/api` would have been collected by nothing and reported by nothing.
          include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
          // `*.int.test.ts` also matches `*.test.ts`. Without this exclusion the unit run
          // requires Docker. The fixtures are excluded here and ignored by ESLint too
          // (`eslint.config.js`), so they are neither run nor linted: `tests/boundary-rule.test.ts`
          // is what exercises them, by running `depcruise` over them and asserting it reports the
          // violation each one was written to trigger.
          exclude: [
            '**/*.int.test.ts',
            '**/node_modules/**',
            '**/dist/**',
            '**/__boundary-fixture__/**',
          ],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/**/*.int.test.ts', 'apps/**/*.int.test.ts', 'tests/**/*.int.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // Measured on the domain only: a repository-wide threshold is satisfied by testing
      // controllers, which proves nothing this mockup claims. `@erp/platform` is included whole
      // because it holds domain-grade code that belongs to no module — typed errors, dated
      // resolution, the Tjm — and it has no `domain/` directory to match the first glob.
      // `apps/api/src/web/render/**` is the third entry and is not an application directory
      // being smuggled in: it is the escaping machinery of ADR-0025, and it is the only code in
      // this repository whose failure is an XSS. The rest of `apps/` stays out — a route handler
      // proves nothing by being executed — and ADR-0025 says so rather than leaving the shape of
      // this glob to be inferred.
      include: [
        'packages/*/src/domain/**/*.ts',
        'packages/platform/src/**/*.ts',
        'apps/api/src/web/render/**/*.ts',
      ],
      // Deliberate violations, never imported by anything shipped, and test scaffolding: neither
      // is code the domain runs, and a threshold that measures its own fixtures is measuring the
      // wrong surface.
      exclude: ['**/__boundary-fixture__/**', '**/testing/**'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
