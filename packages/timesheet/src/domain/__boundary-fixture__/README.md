# Domain boundary fixture

`forbidden-npm-import.ts` imports an npm package from inside `domain/` on purpose. It is excluded
from the normal `pnpm run boundaries` run, from `tsc` and from ESLint, and nothing imports it.

It exists because `domain-has-no-external-dependency` spent Phase 0 reporting clean on code it could
not see: the cruiser excluded `node_modules` wholesale, so every npm package was erased from the
graph before the rule was evaluated, and only a `node:` builtin could ever trip it. A domain
importing an ORM — the thing the rule is written for — was invisible.

`boundary-rule.test.ts` cruises this file and asserts it is **rejected**. If that test fails, the
rule is dead again; the fixture is not the problem.
