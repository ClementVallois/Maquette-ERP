# Kernel boundary fixture

`forbidden-npm-import.ts` imports an npm package from inside `@erp/platform` on purpose, and
`wall-clock.ts` reads the system clock and exposes a public setter. Nothing imports either; they are
excluded from `pnpm run boundaries`, from `tsc`, from the normal ESLint run and from coverage.

They exist because ADR-0033 moved domain-grade code — the value objects, the typed errors, the
dated resolution — into a package with no `domain/` directory, while both guards that hold the
domain were scoped to `packages/*/src/domain/`. For one phase, the code that moved was exempt from
the rules the code that stayed obeys.

`tests/boundary-rule.test.ts` and `tests/lint-rules.test.ts` assert both files are **rejected**.
