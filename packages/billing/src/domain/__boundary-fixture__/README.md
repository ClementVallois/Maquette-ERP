# Money guard fixture

`float-money.ts` and `float-money.test.ts` hold, on purpose, every form of float-producing
arithmetic on money that `docs/BUILD-RULES.md` § Money forbids. They are excluded from `tsc`, from
the normal ESLint run and from the test run, and nothing imports them.

They exist because that rule was **claimed in the present tense from Phase 0 and implemented in
Phase 2**: the sentence "the lint rule therefore forbids float-producing arithmetic on money" was
true of the document and false of the repository for two phases. ADR-0035 records what the rule
bans and what replaces each ban.

The pair is two files for the same reason the clock fixture is: the rule is **narrowed** for tests,
and a narrowing is what a guard gets wrong. The calls — `parseFloat`, `Number()`, `Math.round` —
are refused in both scopes, because a `Math.round` added to make an assertion pass is the failure
itself. The decimal **literal** is refused only in shipped domain code: a negative test proves a
factory refuses a float by handing it one, and `halfDays(1.5)` is that test.

`lint-rules.test.ts` lints both files and asserts the violations are rejected. If it fails, the
rule is dead again; the fixtures are not the problem.
