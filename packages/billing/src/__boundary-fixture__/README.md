# Boundary fixture

`forbidden-import.ts` breaks the `billing → timesheet` rule on purpose. It is excluded from the
normal `pnpm run boundaries` run and is never imported by production code.

It exists because a green CI is ambiguous: it can mean the code is clean, or it can mean the rule
stopped working. `boundary-rule.test.ts` runs the cruiser against this file and asserts it is
**rejected**, which is the only way to know the guard still tells allowed from forbidden.

If this test ever fails, the rule is dead — not the fixture.
