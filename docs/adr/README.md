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

| No.                                                                    | Decision                                                                        | Status   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| [0001](./0001-sealed-modules-and-in-process-domain-event.md)           | Two sealed modules, one arrow, verified mechanically                            | accepted |
| [0002](./0002-money-as-integer-cents.md)                               | Money is an integer number of cents, with no wrapper type                       | accepted |
| [0003](./0003-authorization-at-the-repository.md)                      | Authorization lives in the repository, not in Postgres RLS                      | accepted |
| [0004](./0004-working-calendar-with-a-fixed-holiday-table.md)          | The working calendar is a domain component with a fixed 2026 holiday table      | accepted |
| [0005](./0005-cra-lifecycle-and-immutability.md)                       | The Cra lifecycle, and where immutability binds                                 | accepted |
| [0006](./0006-separation-of-duties.md)                                 | Separation of duties: two rules, and where they are enforced                    | accepted |
| [0008](./0008-fastify-not-nestjs.md)                                   | Fastify, not NestJS                                                             | accepted |
| [0009](./0009-server-rendered-html-no-client-framework.md)             | Server-rendered HTML, with no client framework                                  | accepted |
| [0010](./0010-vat-rounded-per-rate.md)                                 | VAT is rounded per rate, and the rate is resolved from territoriality           | accepted |
| [0011](./0011-hand-written-sql-no-orm.md)                              | Hand-written SQL over `pg`, and no ORM                                          | accepted |
| [0012](./0012-half-day-as-the-storage-unit.md)                         | The half-day is the single storage unit for recorded time                       | accepted |
| [0013](./0013-invoice-line-carries-its-origin.md)                      | The invoice line carries its origin, though only `Regie` exists                 | accepted |
| [0014](./0014-triage-leaves-the-public-history.md)                     | The working triage leaves the public history                                    | accepted |
| [0015](./0015-apps-tier-separate-from-packages.md)                     | The application shell lives in `apps/`, a tier above `packages/`                | accepted |
| [0016](./0016-typed-errors-business-versus-technical.md)               | Typed errors: business versus technical, and how they reach the wire            | accepted |
| [0017](./0017-legal-mentions-modelled-not-templated.md)                | Mandatory legal mentions are modelled on the document, not templated            | accepted |
| [0018](./0018-one-series-for-invoices-and-credit-notes.md)             | One number series for invoices and credit notes, keyed (entity, fiscal year)    | accepted |
| [0031](./0031-reference-data-per-module-projections.md)                | Reference data: per-module projections, the seed as single writer               | accepted |
| [0033](./0033-shared-kernel-holds-the-transported-vocabulary.md)       | The shared kernel holds the vocabulary the boundary transports                  | accepted |
| [0034](./0034-dated-references-resolved-at-the-close-of-the-period.md) | One dated-reference mechanism, resolved at the close of the period              | accepted |
| [0035](./0035-exact-money-arithmetic-half-up-and-basis-points.md)      | Exact money arithmetic: half-up on integers, rates in basis points              | accepted |
| [0036](./0036-a-credit-note-carries-positive-amounts.md)               | A credit note carries positive amounts; the document type carries the direction | accepted |

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

0035 onwards continue that sequence, for decisions Phase 2 reached that the plan had not identified.
The plan's reservations for 0019–0032 are untouched: a number it assigned to a phase stays assigned
to that phase, and a decision taken early takes the next free number instead of borrowing one.

## Identified, not yet decided

Numbers are reserved so that what is **known and unsettled** is visible rather than implied.

| No.  | Decision                                    | Blocked on                     |
| ---- | ------------------------------------------- | ------------------------------ |
| 0007 | Gapless invoice numbering under concurrency | to be written with persistence |
