# ADR-0047 — What counts as a second implementation, and what is not a port at all

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/BUILD-RULES.md` § Boundary and layering says: "A port is introduced only at the **second real
implementation**. Three exist: `Clock`, `CraRepository`, `InvoiceRepository`." It is a YAGNI rule
and it has held since Phase 0.

Phase 5 introduced four more — `Transactionally`, `EventStore`, `PersonaCatalogue`, `PgReadClient`
— and no ADR touched the rule. The enumeration is now false whatever one concludes, and a reviewer
reading the rule against the code cannot tell whether four exceptions were taken deliberately or
whether the rule quietly stopped being applied. Both are bad, and only one is true.

Looking at the four, the disagreement turns out to be about two words rather than about the rule.

## Decision

**The criterion stands, unchanged.** A port is introduced at the second real implementation, never
in anticipation of one. Two clarifications, because both were being read wrongly:

**1. "Real implementation" does not mean "production implementation".** A substitute that a test
must inject to prove something otherwise unprovable is a real implementation. The precedent is in
the rule's own list: `Clock` has exactly one production implementation and exists entirely so a
fake one can be injected — that is the whole reason dated invariants are deterministic here. Read
that way, three of Phase 5's four qualify, and each has a second implementation in the tree today:

| Port               | Production           | Second, and what it buys                                                                                                                           |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Transactionally`  | `pgTransactionally`  | `savepointTransactionally` — the integration suite's per-test rollback; and a throwing stub, so a unit test proves a route needs no database       |
| `EventStore`       | `PgEventStore`       | A fault-injecting one, in `validate-cra.int.test.ts`. It is what proves the both-or-nothing transaction: **the test cannot be written without it** |
| `PersonaCatalogue` | `PgPersonaCatalogue` | `inMemoryPersonas` — the access rules are about roles and offices, not rows, and this makes them provable at unit speed                            |

The test that could not otherwise be written is the discriminator. `EventStore` is the clearest
case: without the interface there is no way to make the journal write fail on demand, and the
guarantee this repository exists to demonstrate — validate and draft commit together or not at all
— would be asserted rather than proven.

**2. `PgReadClient` is not a port and the rule does not reach it.** It is a two-line structural
narrowing of `pg`'s own `query` signature, declared once so the generic is not rewritten in every
reader. It abstracts no decision, has no substitute, and inverts no dependency: it is a **type
alias for a third-party shape**, and each module's `infrastructure/` layer declares the same one
for the same reason. Calling it a port is what made the count look like four.

**The enumeration goes.** BUILD-RULES states the criterion and stops listing the instances. A list
of ports in a rules file is a second source of truth for something `grep` answers exactly, and it
went stale within one phase of being written — which is the argument, not an anecdote.

## Rejected option

**Replace the criterion with "a port exists where a seam must be substitutable to be tested."**
Closer to what actually decides it, and it would have admitted all four without argument. It loses
because it admits nearly anything: almost any collaborator becomes easier to test behind an
interface, and the rule's entire value is that it refuses the interface you cannot yet name a
second implementation of. Counting implementations is a blunt test that produces the right answer;
"would this be easier to test" is a sharp test that produces whatever the author wanted.

**Keep the criterion literally and delete the three ports.** `EventStore`, `PersonaCatalogue` and
`PgReadClient` become concrete types. It honours the letter of the rule and costs the transaction
proof, which is not a trade this repository can make: the one test that most directly supports the
central claim would be deleted to satisfy a rule about anticipation, in a case where nothing was
anticipated.

**Keep the enumeration and correct it to seven.** Half a line, and it is wrong again at the next
port. The rule is the criterion; the list was never the rule.

## Reconsideration threshold

Reopen at the first port whose second implementation is **only** a mock asserting it was called —
`expect(port.save).toHaveBeenCalled()` rather than a substitute that makes an otherwise impossible
test possible. That is the shape clarification 1 would be being abused to permit, and it is
distinguishable: a fake that stands in for behaviour has behaviour, a mock that records calls has
none.

Reopen if the count of ports passes roughly a dozen. At that point "we only add one at the second
implementation" is being satisfied while the surface grows anyway, and the constraint that is
actually needed is about the number of seams and not about how each one was justified.

## Consequences

BUILD-RULES states the criterion, names the `Clock` precedent for what "real" means, and lists no
ports. Nothing in the code changes.

The rule becomes slightly harder to apply — "is this substitute real?" needs a judgement where
counting did not — and the reconsideration threshold above is the mitigation: the failure mode is
named in advance, so the next reviewer knows what abuse looks like.

`PgReadClient` and its per-module twins are now explicitly outside this rule, which also means
adding a fourth copy in a fourth tier is not a decision anyone needs to defend against it.
