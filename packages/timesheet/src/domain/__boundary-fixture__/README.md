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
