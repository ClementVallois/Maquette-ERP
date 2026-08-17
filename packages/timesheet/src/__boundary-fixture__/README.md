# Boundary fixture — a module reaching into an app

`forbidden-app-import.ts` breaks the `no-module-to-app` rule on purpose: a module imports something
out of `apps/`. It is excluded from the normal `pnpm run boundaries` run and is never imported by
production code.

The direction is the whole point. An application composes modules; a module does not know it is
deployed, or by what. That arrow is the one that would let a domain rule start depending on a screen
— and it is the cheapest to write by accident, because at the moment it is written the two files sit
side by side in the same editor.

It imports the leaf `apps/__boundary-fixture__/src/index.ts` rather than either of the other fixture
files: importing one of those would close a cycle and the cruise would report `no-circular`, so the
test would go green on a rule that is not the one under test.

`tests/boundary-rule.test.ts` asserts the rejection by rule name. If that test fails, the rule is
dead — not the fixture.
