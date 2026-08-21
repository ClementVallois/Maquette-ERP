# ADR-0046 — `Intercontrat` is modelled as an internal non-billable mission

- **Date**: 2026-08-21
- **Status**: accepted

## Context

A consultant on the bench cannot submit a complete `Cra`. The submission checks require **every**
workable day of the month to be accounted for, and `DayType` has no value meaning "staffed on
nothing". One of the two rules has to give, or the firm's most ordinary staffing situation cannot
be recorded at all — and `CLAUDE.md` § Dataset shape requires the seed to contain exactly this case.

The arbitration was made on 18/08/2026 and recorded as a settled row in `docs/open-questions.md`,
which is where it should not have stayed. It shapes the domain's completeness rule and interacts
with ADR-0037, so `CLAUDE.md` requires it to be an ADR with a reconsideration threshold, and it had
neither. It also left `CONTEXT.md` glossing `Intercontrat` as "a consultant currently **staffed on
no mission**" while the seed staffs Inès Garcia on a mission literally named `Intercontrat` — two
current documents saying opposite things, with the glossary as the declared authority.

## Decision

**An intercontrat consultant is staffed on an internal `Forfait` mission**, sold by the firm to
itself, open-ended, named `Intercontrat`. Their workable days are recorded as `worked` against it,
exactly like any other day.

Nothing in the domain is special-cased. Three properties fall out, and each one is why this option
was taken:

- **`DayType` is unchanged.** No fifth value, no firmwide structural term added to accommodate one
  staffing scenario.
- **The completeness rule stays absolute.** Every workable day is accounted for, for every
  consultant, with no exception — which is the rule that catches an unaccounted month, and it is
  worth nothing the moment it has an exception.
- **The days produce no invoice, by the rule that already exists.** A `worked` day on a `Forfait`
  mission is declined by `billing` as `notRegie` (ADR-0037). The day was worked, it is recorded, it
  is reported as declined with its reason, and nothing is billed. No new mechanism was needed.

`CONTEXT.md` carries the mechanism in the `Intercontrat` entry, because a glossary that describes
the concept and not its representation sends a reader looking for a table that does not exist.

## Rejected option

**A fifth `DayType` — `intercontrat`.** The obvious modelling, and the one a reader proposes first:
the day is genuinely a different kind of day. It loses because `DayType` is a term in the firm's
ubiquitous language about **what a person did on a day**, and "was between assignments" is a fact
about their _staffing_, not about the day. Adding it puts a commercial state into the timesheet
vocabulary, where it would then have to be handled by every rule that switches on `DayType` — the
calendar checks, the invoicing filter, the flagging — for one scenario that the mission dimension
already expresses.

**Relaxing the completeness rule** so a bench consultant may submit a month with unaccounted days.
Cheapest of the three, and it costs the invariant: a rule that permits an unaccounted day cannot
distinguish a consultant on the bench from a consultant who forgot a week, which is precisely the
discrepancy this chain exists to remove.

**A nullable `missionId` on the day.** Rejected with the option above and for the same reason
ADR-0013 gives about lines: a null that means "none" and a null that means "not yet entered" are
indistinguishable a month later.

## Reconsideration threshold

Reopen when the firm needs to **report on** intercontrat rather than merely record it — a bench-rate
indicator, a TACE, a utilisation figure per practice. All of those need bench time to be a queryable
category, and deriving it from "assigned to the mission whose name is `Intercontrat`" is a string
comparison standing in for a domain concept. At that point the internal mission gains a typed
marker, or the fifth `DayType` becomes the right answer after all.

Reopen if a second internal non-billable mission appears — training, pre-sales, internal R&D. Two
of them means the category is real and unnamed, and the seed's `internalClient` is doing work the
model should be doing.

## Consequences

The seed's intercontrat consultant submits a Cra that passes every submission check unmodified, and
that Cra produces zero invoice lines and one `DeclinedDays` record with reason `notRegie`. The
scenario `CLAUDE.md` requires is therefore exercised by the same code path as every other, which is
the whole argument for it.

An internal "client" row exists, representing the firm itself, because a `Mission` requires a
`clientId`. It is visible in the dataset and is not a real customer — a reader meeting it should not
conclude the firm sells to itself.

Anyone reading `billing.declined_days` for a bench consultant sees a month of declined days with
reason `notRegie`. That is correct and it is not an error state; the pré-facturier's blocking-reason
column has to be readable as "nothing to bill here, and here is why" rather than as a failure.
