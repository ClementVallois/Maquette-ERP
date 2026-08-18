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

| No.                                                              | Decision                                                                   | Status   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| [0001](./0001-sealed-modules-and-in-process-domain-event.md)     | Two sealed modules, one arrow, verified mechanically                       | accepted |
| [0002](./0002-money-as-integer-cents.md)                         | Money is an integer number of cents, with no wrapper type                  | accepted |
| [0003](./0003-authorization-at-the-repository.md)                | Authorization lives in the repository, not in Postgres RLS                 | accepted |
| [0004](./0004-working-calendar-with-a-fixed-holiday-table.md)    | The working calendar is a domain component with a fixed 2026 holiday table | accepted |
| [0008](./0008-fastify-not-nestjs.md)                             | Fastify, not NestJS                                                        | accepted |
| [0009](./0009-server-rendered-html-no-client-framework.md)       | Server-rendered HTML, with no client framework                             | accepted |
| [0010](./0010-vat-rounded-per-rate.md)                           | VAT is rounded per rate, and the rate is resolved from territoriality      | accepted |
| [0011](./0011-hand-written-sql-no-orm.md)                        | Hand-written SQL over `pg`, and no ORM                                     | accepted |
| [0014](./0014-triage-leaves-the-public-history.md)               | The working triage leaves the public history                               | accepted |
| [0015](./0015-apps-tier-separate-from-packages.md)               | The application shell lives in `apps/`, a tier above `packages/`           | accepted |
| [0016](./0016-typed-errors-business-versus-technical.md)         | Typed errors: business versus technical, and how they reach the wire       | accepted |
| [0033](./0033-shared-kernel-holds-the-transported-vocabulary.md) | The shared kernel holds the vocabulary the boundary transports             | accepted |

0008–0011 were written on 17/08 out of numeric order relative to 0005–0007. Those three numbers were
**reserved** earlier the same day, and a reservation is honoured rather than reshuffled — renumbering
to close the gap is exactly the retouching that rule 1 above forbids. The gap is the record: it shows
which decisions were known before they were made.

0014 onwards were reserved the same day by `docs/BUILD-PLAN.md`, which assigns each remaining number
to the phase that consumes it. A number there is a commitment that the decision will be written when
it is taken, not a placeholder to be shuffled.

0033 is the first number **not** reserved by that table: the plan's last reserved number is 0032, and
Phase 1 hit a structural question the plan had not identified — where a value object both modules
speak lives, given that the cruiser forbids the import that would otherwise settle it. Written when
it was taken, numbered after the reservations, and recorded in the Phase 1 checkpoint.

## Identified, not yet decided

Numbers are reserved so that what is **known and unsettled** is visible rather than implied.

| No.  | Decision                                                                                             | Blocked on                                 |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0006 | Separation of duties: whoever records a Cra does not validate it, whoever validates does not invoice | to be written with the validation use case |
| 0007 | Gapless invoice numbering under concurrency                                                          | to be written with persistence             |
| 0013 | Polymorphic invoice line: it carries its origin even though only `Regie` exists                      | to be written with the billing domain      |
