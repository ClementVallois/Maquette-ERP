# Boundary fixture — the `apps/` arrows

`apps/` holds what is deployed; `packages/` holds the modules. Task 0.3 of `docs/BUILD-PLAN.md`
declares the tier and the two rules that govern it (**ADR-0015**). No application exists yet, so
these files are the only thing the rules can be run against — and a rule that has never rejected
anything is indistinguishable from a rule that does not work.

Three arrows, one file each, all excluded from `pnpm run boundaries` and never imported by anything
that ships:

| File                       | Arrow                       | Expected                    |
| -------------------------- | --------------------------- | --------------------------- |
| `allowed-public-import.ts` | app → module public `index` | **accepted**                |
| `forbidden-deep-import.ts` | app → module internals      | rejected — `not-in-allowed` |
| `index.ts`                 | nothing — a leaf to import  | —                           |

The fourth arrow, module → app, cannot live here: it has to start inside a module. It is
`packages/timesheet/src/__boundary-fixture__/forbidden-app-import.ts`, and it imports the leaf
`index.ts` in this directory rather than one of the other two — otherwise the cruise reports a cycle
and the test would pass on the wrong rule.

`tests/boundary-rule.test.ts` asserts each of the three outcomes by rule name. If one of those cases
fails, the rule is dead — not the fixture.
