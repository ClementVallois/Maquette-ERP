# Money guard fixture, application layer

The sibling of `../../domain/__boundary-fixture__/float-money.ts`, and the one that exists because
of a finding rather than a decision.

The money rule was first written scoped to `packages/*/src/domain/**` and the kernel. That exempted
`application/` — `draft-invoices.ts`, the file that reads a `Tjm` off the reference and hands it to
`regieLine` — where a `Math.round` would have linted clean. It is the failure family
`docs/BUILD-RULES.md` § Boundary and layering already names in its own words, one directory down:
a rule scoped to a directory holds the code that stayed and exempts the code that moved.

The three **calls** are now banned repository-wide, which is how BUILD-RULES § Money states them.
The decimal **literal** is deliberately absent from this file: that ban stays scoped to the domain
and the kernel, ADR-0035 says why, and a fixture asserting it fires here would be asserting the
opposite of the decision.

`../../../../../tests/lint-rules.test.ts` lints this file and asserts the three calls are rejected
and the literal ban is not in force.
