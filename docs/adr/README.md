# Architecture decisions (ADR)

One ADR per structural arbitration, written **at the time** of the arbitration. Format:
`NNNN-title-in-kebab-case.md`, from `0000-template.md`.

Each ADR answers the three questions a reviewer will ask anyway: **which option was rejected**, **why
it loses in this precise context**, and **at what threshold we would change our mind**.

Two record-keeping rules, because the point of this log is that it was not retouched afterwards:

1. Numbering follows the order in which ADRs were written and is **never reassigned**.
2. An ADR is **not rewritten**. A decision that changes produces a **new** ADR that supersedes the
   previous one; the old one stays in place with its status updated.

## Accepted

| No.                                                           | Decision                                                                   | Status   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| [0001](./0001-sealed-modules-and-in-process-domain-event.md)  | Two sealed modules, one arrow, verified mechanically                       | accepted |
| [0002](./0002-money-as-integer-cents.md)                      | Money is an integer number of cents, with no wrapper type                  | accepted |
| [0003](./0003-authorization-at-the-repository.md)             | Authorization lives in the repository, not in Postgres RLS                 | accepted |
| [0004](./0004-working-calendar-with-a-fixed-holiday-table.md) | The working calendar is a domain component with a fixed 2026 holiday table | accepted |

## Identified, not yet decided

Numbers are reserved so that what is **known and unsettled** is visible rather than implied.

| No.  | Decision                                                                                             | Blocked on                                 |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0005 | Cra lifecycle: draft → submitted → refused/validated, and where immutability binds                   | to be written with the timesheet domain    |
| 0006 | Separation of duties: whoever records a Cra does not validate it, whoever validates does not invoice | to be written with the validation use case |
| 0007 | Gapless invoice numbering under concurrency                                                          | to be written with persistence             |
| 0008 | Server framework and HTTP error shape (RFC 9457)                                                     | to be written with the API                 |
| 0009 | Front-end framework and how it consumes the API                                                      | to be written with the web client          |
