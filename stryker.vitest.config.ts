import { defineConfig } from 'vitest/config';

// The Vitest config Stryker drives (stryker.config.json's vitest.configFile), scoped to
// packages-only unit tests so a nightly mutation run does not also collect apps/web and apps/api,
// neither of which exercises a packages/*/src/domain mutation (ADR-0027).
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/__boundary-fixture__/**'],
  },
});
