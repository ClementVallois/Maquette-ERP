# Money guard fixture, infrastructure layer

The third of the set, and the second to exist because of a finding rather than a decision — the
same finding as its `application/` sibling, one phase and one directory later.

Phase 3 gave `packages/*/src/infrastructure/**` its own ESLint block, for reasons that are all
legitimate: `@types/pg` is a devDependency, `query<T>` is generic, and a DB row needs a non-null
assertion where the query has already selected the column. Writing that block replaced
`no-restricted-syntax` wholesale — ESLint does not merge the option arrays — and the money calls
went with it. `parseFloat`, `Number()` and `Math.round` were legal again in the one layer that
reads money out of the database, and `pg-invoice-repository.ts` used bare `Number()` on ten
monetary columns.

The block's comment had said all along that the `Number()` ban was "replaced by the integer-only
subset: `Number.parseInt` names what it does". That was true of the intent and of nothing else:
`NO_FLOAT_MONEY_CALLS` already permits `Number.parseInt` — its selector matches a bare `Number()`
call, not a member call — so keeping the list was always both halves. Dropping it kept neither.

The last line of `float-money.ts` is `Number.parseInt`, and the test asserts **three** violations
and not four. That is the half a message-only assertion would not have caught: a rule tightened
until the layer cannot do its job gets loosened again by the next person who needs it to.

`../../../../../tests/lint-rules.test.ts` lints this file. The code that had to change with the
rule is `../columns.ts`, which reads an integer column or refuses, and never truncates.
