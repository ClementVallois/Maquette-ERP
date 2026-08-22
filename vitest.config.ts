import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
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
