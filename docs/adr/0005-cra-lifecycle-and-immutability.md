# ADR-0005 — The Cra lifecycle, and where immutability binds

- **Date**: 2026-08-18
- **Status**: accepted

## Context

A Cra moves between four states and produces an invoice at the end of that movement.
`CONTEXT.md` fixed the vocabulary — `Draft`, `Submitted`, `Validated`, `Refused` — and
`CLAUDE.md` advertises that a validated Cra is immutable. What neither says is **which
transitions exist**, **what a refusal does to the record**, and **which layer refuses a change
to a validated Cra**. A status column with no guard behind it is the failure this mockup is
supposed to rule out: it makes the state readable and the invariant unenforced.

The stakes are legal rather than technical. A Cra is a record of working time. Once validated it
has been accepted by a manager, and in this chain it has also produced a draft invoice. Editing it
afterwards means the invoice no longer matches the record it was derived from — which is exactly
the discrepancy between work delivered and revenue invoiced that this mockup exists to close.

## Decision

Four transitions, and no others:

- `Draft → Submitted` — the consultant hands the month over.
- `Submitted → Validated` — the manager accepts. Terminal.
- `Submitted → Refused` — the manager sends it back, **with a reason**. A refusal without a reason
  is refused itself: the consultant has to know what to correct.
- `Refused → Submitted` — the consultant corrects and resubmits. The stale refusal is dropped at
  that point, so the record never shows a refusal against a Cra currently awaiting validation.

A `Refused` Cra is editable; a `Submitted` one is not, in either direction — the consultant has
handed it over and the manager has not answered yet.

**Immutability binds in the aggregate**, in `Cra` itself, not in the repository and not in a
database constraint. Every method that would change a validated Cra throws
`ValidatedCraIsImmutableError`, whose message states the legal reason rather than "invalid state".
The database will double it in Phase 3 (ADR-0011's hand-written SQL, a status check), and the rule
in `BUILD-RULES.md` stands: the database may double an invariant, never carry it alone.

A correction to a `Draft` is remove-then-record — `clearDay` then `recordDay` — not an edit in
place. There is no method that mutates an existing line.

## Rejected option

**Letting a manager reopen a validated Cra.** The option every user asks for, and the one an
internal tool usually ships. It loses because a validated Cra in this chain has already produced a
draft invoice: reopening it silently desynchronises the record from the document derived from it,
and the audit trail — the CRA → line → invoice chain this repository claims as its _piste d'audit
fiable_ — stops being a trail. The correction path exists and it is downstream: a credit note
against the invoice, and a new record. If reopening is ever needed, it is a **transition with its
own trace**, not the absence of a guard.

**A generic workflow engine** — states, transitions and guards described in data, driven by a
small interpreter. It is the reflex when a second document (the invoice) turns out to have states
too. It loses on YAGNI, at this size decisively: two documents, four transitions each, and the
engine would be more code than the rules it drives. It also moves the invariant out of the
aggregate and into configuration, where the type checker cannot see it.

**Enforcing immutability in the repository.** Tempting because ADR-0003 already puts authorization
there. It loses because the repository is not the only caller: the validation use case, a future
job, and the seed all hold a `Cra` in memory, and only the aggregate is on every path.

## Reconsideration threshold

Reopen when a **correction before issuance** becomes a real business need — the invoice is drafted
but not issued, and the firm wants the record fixed rather than credited. That is a fifth
transition (`Validated → Draft`, or a `Devalidated` state) with its own actor, its own reason and
its own event, and it must be decided as such rather than by relaxing the guard.

Also reopen if a Cra ever needs to be validated in parts — per mission or per week — which would
make "validated" a property of a line rather than of the month.

## Consequences

The state a reader has to keep in mind is small: four states, four transitions, one terminal.
Every refusal is a typed error naming the rule, so the API can answer _why_ rather than 409 with
an empty body.

Because immutability lives in the aggregate, the same guard holds in a unit test with no database,
which is what lets Phase 1 prove it before Phase 3 exists.

The cost is that a mistake after validation has no cheap fix, by construction. That is the
intended trade: the expensive path is the correct one, and the credit note is the business's own
answer to the same problem.
