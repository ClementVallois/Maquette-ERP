import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
          // `*.int.test.ts` also matches `*.test.ts`. Without this exclusion the unit run
          // requires Docker.
          exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/**/*.int.test.ts', 'apps/**/*.int.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // Measured on the domain only: a repository-wide threshold is satisfied by testing
      // controllers, which proves nothing this mockup claims. `@erp/platform` is included whole
      // because it holds domain-grade code that belongs to no module — typed errors, dated
      // resolution, the Tjm — and it has no `domain/` directory to match the first glob.
      include: ['packages/*/src/domain/**/*.ts', 'packages/platform/src/**/*.ts'],
      // Deliberate violations, never imported by anything shipped. They are code the boundary
      // tests cruise, not code the domain runs.
      exclude: ['**/__boundary-fixture__/**'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
