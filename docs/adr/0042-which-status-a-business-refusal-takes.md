# ADR-0042 — Which HTTP status a business refusal takes, and what a refusal may publish

- **Date**: 2026-08-19
- **Status**: accepted

## Context

ADR-0016 decided that the mapping from `problemType` to HTTP status lives in `apps/api`, and
deliberately decided nothing about the mapping itself: "`BUILD-RULES.md` fixes the mapping —
validation → 400, violated invariant → 409, insufficient scope → 403 — and this ADR fixes only
**where** it is applied."

That is three rules for **twenty-six** problem types, and applying them turns out to require two
decisions the rules do not settle.

**First**, "validation" is one word for two different events. A request that is not a request —
malformed JSON, a missing path parameter, a query the route does not accept — is a fact about
the transport. A value that parses and that a **domain rule** refuses — `halfDays(1.5)`, payment
terms of 90 days — is a fact about the business, and it is the domain that produced it.
`docs/BUILD-PLAN.md` § 5.3 already wrote "validation → 400/422" while `BUILD-RULES.md` says 400.
One of the two is wrong until someone says which.

**Second**, a 403 is not just a status. ADR-0003 requires that the refusal **name the rule that
denied it** — that is beat two of the demonstration the whole authorization claim rests on. And
ADR-0016's own reconsideration threshold names the hazard that comes with it: a permission refusal
is modelled as a `BusinessError`, and a `BusinessError` carries `details`; publishing them
describes the record the caller has just been told they may not see.

## Decision

**Three statuses for business refusals, and only three: 403, 409, 422.** Never 400, never 500.

| Status  | The question it answers                                       | Example                                                                   |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **422** | The **value** is refused by a rule about values               | `/problems/invalid-value`, `/problems/payment-terms-too-long`             |
| **409** | The value is fine; the **state** refuses it                   | `/problems/validated-cra-is-immutable`, `/problems/cra-already-processed` |
| **403** | The **caller** may not — whoever they are, whatever the state | `/problems/not-the-manager`, `/problems/validator-cannot-issue`           |

**400 belongs to the transport and never to the domain.** A malformed body, a payload past the
limit, a query parameter the route cannot parse: those are answered `400` with the API's own
`/problems/malformed-request`, decided before any module is called. This resolves the
BUILD-RULES/BUILD-PLAN disagreement in BUILD-PLAN's favour and states why: the two failures have
different authors, different fixes, and a client that cannot tell them apart retries the one it
should not.

**The mapping is a table keyed by `problemType`, not by class.** The dependency rule grants
`apps/` a module's public index and nothing behind it, so an exhaustive `instanceof` chain would
need to import twenty-six classes; a string table needs none, and a module can add an error
without this file changing.

**A missing entry answers 500 and publishes nothing** — silent by construction, so the table is
guarded by a test rather than by attention. `problem.test.ts` reads every `problemType = '…'`
literal out of `packages/**` and asserts three things: every declared type is in the table, the
table maps nothing that is not declared, and the statuses it produces are exactly `{403, 409, 422}`.
It also asserts it found more than twenty types at all, because a regex that stops matching would
make the other three pass vacuously.

**What each status may publish:**

- **403** publishes `deniedBy` — the identifier of the rule — and **no `details` at all**. This is
  ADR-0016's threshold held as a serialisation rule until the day it earns its own base class.
- **409** publishes `invariant` and the business fields, which are what the caller needs to fix
  the state.
- **422** publishes the business fields, which name the offending field and value.
- **500** publishes the correlation id and nothing else, business error or not.

## Rejected option

**One status for every business refusal — 409, or 422.** Half the file, no table, no guard, and
`type` still discriminates for a client that reads it. It loses on the reader who does not: a
proxy, a retry policy, a browser's `fetch` wrapper and a log dashboard all branch on status before
anyone reads a body. Collapsing "you may not" into "the state disagrees" tells an operator that a
scope refusal is a conflict to retry, and tells a monitoring rule that a broken invariant is an
access-control event. The status is the summary, and a summary that is wrong is worse than a coarse
one.

**Carrying the status on the error class**, which is what most codebases do and what makes the
table unnecessary. Already rejected by ADR-0016 for putting transport in the domain; it is worth
restating because this ADR is exactly where that shortcut becomes tempting.

**Publishing `details` on a 403** — the caller then knows _why_ precisely, which is friendlier. It
loses on the one thing the 403 exists to protect: the details of `ValidatorCannotIssueError` name
the invoice and the validator, and the details of an out-of-scope refusal would name the record in
the office the caller may not read. A refusal that describes what it is hiding is not a refusal.

## Reconsideration threshold

Reopen when a **client** exists that branches on `status` rather than on `type`. At that point the
statuses are a published contract and cannot be re-decided per refusal; today the only clients are
this repository's own tests and the screens of Phase 6.

Reopen the 403 rule the day a permission refusal needs to say more than the rule's name — that is
precisely ADR-0016's threshold, and it is reached by giving permission refusals their own base
class with their own serialisation, not by relaxing this one.

Reopen the 400/422 split if a route ever validates a value **twice** — once with Zod at the
boundary and once in the domain — because that is the point at which the same wrong value gets two
different statuses depending on which check happens to run first. The fix is to remove the
duplicate check, and BUILD-PLAN 5.3's "Zod at the boundary only — it never replaces a domain
invariant" is what keeps that from happening.

## Consequences

Twenty-six refusals reach the wire with a status a reader can act on and an identifier a client can
branch on, without a single module knowing HTTP exists.

The table is a second place that has to change when a module adds an error — and that is the
point: the guard fails on the day the error is written, in the same phase, rather than on the day
it is first thrown in production and answers 500.

Beat two of ADR-0003's demonstration — "a direct API call refused with a 403 that names the rule
that denied it" — is now expressible. It is not yet _demonstrated_: that needs the routes and the
persona, which are the tasks that follow this one in Phase 5.
