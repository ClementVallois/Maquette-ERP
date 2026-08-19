# Domain boundary fixture

`forbidden-npm-import.ts` imports an npm package from inside `domain/` on purpose. It is excluded
from the normal `pnpm run boundaries` run, from `tsc` and from ESLint, and nothing imports it.

It exists because `domain-has-no-external-dependency` spent Phase 0 reporting clean on code it could
not see: the cruiser excluded `node_modules` wholesale, so every npm package was erased from the
graph before the rule was evaluated, and only a `node:` builtin could ever trip it. A domain
importing an ORM — the thing the rule is written for — was invisible.

`wall-clock.ts` and `wall-clock.test.ts` are the same idea for the ESLint side. Shipped domain code
may not build a `Date` at all; a colocated **test** may build a fixed instant — a fake clock is one
— but not read the wall clock. Two scopes, two different verdicts on almost the same line, which is
exactly the pair a rule narrowing can get wrong.

`boundary-rule.test.ts` cruises the import fixture and `lint-rules.test.ts` lints the two clock
fixtures; both assert the violations are **rejected**. If those tests fail, the rules are dead
again; the fixtures are not the problem.

## `undeclared-npm-import.ts`

The sibling of `forbidden-npm-import.ts`, and it exists because that one was not enough.

dependency-cruiser classifies a third-party import by **the importing package's own manifest**.
`forbidden-npm-import.ts` imports `vitest`, which `packages/timesheet/package.json` declares, so it
is reported as `npm-dev` — a type `domain-has-no-external-dependency` has always listed. A package
declared only in the **root** manifest is reported as `npm-no-pkg`, and the ban did not list that
one. Phase 3 added `pg` to the root manifest and to neither module's, so for the whole phase a
domain file could `import pg from 'pg'` and cruise green.

This fixture imports `prettier` — a root-only devDependency, and one no module will ever have a
reason to declare, so the fixture cannot go stale the way a `pg` fixture would have the moment the
modules declared `pg` (which they now do, which is the other half of the fix).
