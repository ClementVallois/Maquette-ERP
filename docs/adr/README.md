# Architecture decisions (ADR)

One ADR per structural arbitration, written **at the time** of the arbitration. Format:
`NNNN-title-in-kebab-case.md`, from `0000-template.md`.

Each ADR answers the three questions a reviewer will ask anyway: **which option was rejected**, **why
it loses in this precise context**, and **at what threshold we would change our mind**.

Two record-keeping rules, because the point of this log is that it was not retouched afterwards:

1. Numbering follows the order in which ADRs were written and is **never reassigned**.
2. An ADR is **not rewritten**. A decision that changes produces a **new** ADR that supersedes the
   previous one; the old one stays in place with its status updated.

   One exception, narrow on purpose: an ADR may be **corrected for a factual error, before the
   branch that introduced it merges to `main`**, and only where the decision, the rejected option
   and the threshold are untouched — a stated fact that was already false when it was written, not
   a position that has since become inconvenient. The correcting commit says what was wrong and
   why it is a correction rather than a change of mind, so the log still shows the edit rather than
   hiding it. Once an ADR is on `main` it is read by people who did not watch it being written, and
   this exception is closed: a wrong fact then gets a superseding ADR like anything else.

   Used once so far, on ADR-0014 — see the commit `docs(adr): cite commits by what they did`.

## Accepted

| No.                                                                     | Decision                                                                         | Status   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| [0001](./0001-sealed-modules-and-in-process-domain-event.md)            | Two sealed modules, one arrow, verified mechanically                             | accepted |
| [0002](./0002-money-as-integer-cents.md)                                | Money is an integer number of cents, with no wrapper type                        | accepted |
| [0003](./0003-authorization-at-the-repository.md)                       | Authorization lives in the repository, not in Postgres RLS                       | accepted |
| [0004](./0004-working-calendar-with-a-fixed-holiday-table.md)           | The working calendar is a domain component with a fixed 2026 holiday table       | accepted |
| [0005](./0005-cra-lifecycle-and-immutability.md)                        | The Cra lifecycle, and where immutability binds                                  | accepted |
| [0006](./0006-separation-of-duties.md)                                  | Separation of duties: two rules, and where they are enforced                     | accepted |
| [0008](./0008-fastify-not-nestjs.md)                                    | Fastify, not NestJS                                                              | accepted |
| [0009](./0009-server-rendered-html-no-client-framework.md)              | Server-rendered HTML, with no client framework                                   | accepted |
| [0010](./0010-vat-rounded-per-rate.md)                                  | VAT is rounded per rate, and the rate is resolved from territoriality            | accepted |
| [0011](./0011-hand-written-sql-no-orm.md)                               | Hand-written SQL over `pg`, and no ORM                                           | accepted |
| [0012](./0012-half-day-as-the-storage-unit.md)                          | The half-day is the single storage unit for recorded time                        | accepted |
| [0013](./0013-invoice-line-carries-its-origin.md)                       | The invoice line carries its origin, though only `Regie` exists                  | accepted |
| [0014](./0014-triage-leaves-the-public-history.md)                      | The working triage leaves the public history                                     | accepted |
| [0015](./0015-apps-tier-separate-from-packages.md)                      | The application shell lives in `apps/`, a tier above `packages/`                 | accepted |
| [0016](./0016-typed-errors-business-versus-technical.md)                | Typed errors: business versus technical, and how they reach the wire             | accepted |
| [0017](./0017-legal-mentions-modelled-not-templated.md)                 | Mandatory legal mentions are modelled on the document, not templated             | accepted |
| [0018](./0018-one-series-for-invoices-and-credit-notes.md)              | One number series for invoices and credit notes, keyed (entity, fiscal year)     | accepted |
| [0031](./0031-reference-data-per-module-projections.md)                 | Reference data: per-module projections, the seed as single writer                | accepted |
| [0033](./0033-shared-kernel-holds-the-transported-vocabulary.md)        | The shared kernel holds the vocabulary the boundary transports                   | accepted |
| [0034](./0034-dated-references-resolved-at-the-close-of-the-period.md)  | One dated-reference mechanism, resolved at the close of the period               | accepted |
| [0035](./0035-exact-money-arithmetic-half-up-and-basis-points.md)       | Exact money arithmetic: half-up on integers, rates in basis points               | accepted |
| [0036](./0036-a-credit-note-carries-positive-amounts.md)                | A credit note carries positive amounts; the document type carries the direction  | accepted |
| [0037](./0037-only-regie-days-become-invoice-lines.md)                  | Only Regie days become lines, and the days that do not are reported              | accepted |
| [0038](./0038-one-invoice-per-client.md)                                | One validated Cra drafts one invoice per client, so drafting returns a set       | accepted |
| [0019](./0019-tdd-extended-to-persistence.md)                           | Integration tests before SQL, real Postgres, per-test transaction rollback       | accepted |
| [0007](./0007-gapless-invoice-numbering.md)                             | Gapless numbering: a counter row locked with `SELECT … FOR UPDATE`               | accepted |
| [0020](./0020-domain-events-as-persisted-audit-journal.md)              | Domain events are persisted in the emitting transaction, as the audit journal    | accepted |
| [0021](./0021-idempotent-cra-processing.md)                             | Processing the same Cra twice drafts nothing new                                 | accepted |
| [0039](./0039-the-integration-harness-is-a-workspace-member.md)         | The integration harness is a workspace member, not a directory                   | accepted |
| [0040](./0040-ci-gates-are-advisory-while-the-repository-is-private.md) | The CI gates are advisory while the repository is private on the free plan       | accepted |
| [0022](./0022-deterministic-seed-is-a-deliverable.md)                   | The seed is a deliverable, not a fixture: deterministic, Zod-validated           | accepted |
| [0041](./0041-deterministic-uuidv7-for-all-identifiers.md)              | Deterministic UUIDv7 for all identifiers, including child rows                   | accepted |
| [0024](./0024-structured-logging-redacted-by-allowlist.md)              | Structured logging, redacted by allowlist in the serialiser                      | accepted |
| [0042](./0042-which-status-a-business-refusal-takes.md)                 | Which HTTP status a business refusal takes, and what it may publish              | accepted |
| [0023](./0023-persona-selector-instead-of-authentication.md)            | A persona selector instead of authentication, and where authorization is decided | accepted |
| [0043](./0043-economics-is-read-at-the-composition-root.md)             | Margin is read at the composition root, because it belongs to neither module     | accepted |
| [0044](./0044-idempotency-key-is-stored-not-merely-required.md)         | `Idempotency-Key` is stored, not merely required                                 | accepted |

0008–0011 were written on 17/08 out of numeric order relative to 0005–0007. Those three numbers were
**reserved** earlier the same day, and a reservation is honoured rather than reshuffled — renumbering
to close the gap is exactly the retouching that rule 1 above forbids. The gap is the record: it shows
which decisions were known before they were made.

0014 onwards were reserved the same day by `docs/BUILD-PLAN.md`, which assigns each remaining number
to the phase that consumes it. A number there is a commitment that the decision will be written when
it is taken, not a placeholder to be shuffled.

0033 and 0034 are the first numbers **not** reserved by that table: the plan's last reserved number is 0032, and
Phase 1 hit two structural questions the plan had not identified — where a value object both
modules speak lives, given that the cruiser forbids the import that would otherwise settle it
(0033), and how a dated reference resolves for a whole month rather than a day (0034). Both were
written when they were taken, numbered after the reservations, and recorded in the Phase 1
checkpoint.

0035 onwards continue that sequence, for decisions Phase 2 reached that the plan had not identified,
and 0039 and 0040 for the two Phase 3 reached on its way out. 0039: where the shared integration
harness lives, forced by a per-package type error the phase had recorded as an open question on a
false premise. 0040: that the CI gates are advisory, forced by opening the repository's first pull
request and finding that the branch protection the README had claimed since Phase 0 was never
available on this plan.

The plan's reservations for 0019–0032 are untouched: a number it assigned to a phase stays assigned
to that phase, and a decision taken early takes the next free number instead of borrowing one.

0022 takes the number the plan reserved for the seed decision. 0041 continues the unplanned sequence
for a decision Phase 4 reached that the plan had not identified: how child-row identifiers are
generated (UUIDv7 everywhere, deterministic in the seed — the positional string alternative the open
questions had carried was retired).

0024 takes the number the plan reserved for structured logging. 0042 continues the unplanned
sequence, for a decision Phase 5 reached that the plan had not identified: ADR-0016 deliberately
fixed only **where** a `problemType` becomes an HTTP status, and applying it to twenty-six refusals
turned out to need two rulings nothing had made — that a domain refusal never answers 400 (422 and
409 split what "validation" was one word for), and that a 403 publishes the rule that denied it and
none of the business fields that would describe what it is hiding.

0043 and 0044 continue it, for two more the plan had not identified and that writing the routes
forced. 0043: margin needs `Tjm` from one module and `Cjm` from neither, so the read has no module
to live in — and improvising the join inside a route handler is what the ADR discipline exists to
stop. 0044: ADR-0021 promised "replay → original result" through a port that could only answer a
boolean, and BUILD-PLAN required an `Idempotency-Key` that nothing stored; a required header that
changes no behaviour is a gate that is present and inert.

0045 continues the unplanned sequence, and is the only one so far about the record rather than the
code: three ADRs were found to contain statements that were never true, and the absolute
"an ADR is never rewritten" rule would have answered a typo with a superseding note. The test is
now whether the **decision** moved — if it did, supersede; if only its description was wrong, fix
the sentence, because these files are decisions and not logs.

0046 is a promotion rather than a new decision: intercontrat as an internal non-billable mission
was settled on 18/08/2026 and recorded as a row in `docs/open-questions.md`, which was the wrong
place for something that shapes the completeness rule and interacts with ADR-0037. It gains the
reconsideration threshold `CLAUDE.md` requires, and `CONTEXT.md` stops contradicting it.

0047 settles a rule that had gone quietly unapplied: Phase 5 added four ports to a BUILD-RULES line
that enumerated three, and no ADR said whether four exceptions had been taken or the rule had
lapsed. Neither, as it turned out — three of the four meet the criterion once "real implementation"
is read the way `Clock` has always been read, and the fourth is not a port. The enumeration is what
goes.

## Identified, not yet decided

Numbers are reserved so that what is **known and unsettled** is visible rather than implied.

**Empty since 19/08/2026.** 0007 was the only entry and Phase 3 wrote it. The reservations that
remain live in `docs/BUILD-PLAN.md`, which assigns each number to the phase that consumes it; this
table returns when a decision is identified that the plan did not.
