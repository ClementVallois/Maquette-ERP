# ADR-0054 — A late day is a recorded half-day that a closed month has not validated

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` § 6.4 asks the pré-facturier for "the late-days counter" and defines it
nowhere. `CONTEXT.md` — which BUILD-RULES makes the authority, and which forbids using a term in
code before it is in there — has no entry for lateness, no deadline, and no `retard`.

That absence is not an oversight to paper over with a plausible column header. A counter on the
central screen is read as a number the firm acts on, and there are at least four defensible things
"late days" could count, each producing a different number from the same data:

- **Cras that are late**, not days — a count of people to chase, which is what a manager wants on a
  Monday morning.
- **Half-days recorded but not yet validated**, whatever the month — which counts a `Cra` filled in
  yesterday for the month still running, and is therefore never zero.
- **Days elapsed since a submission deadline** — the reading an ERP with an HR calendar would take,
  and the one the phrase most naturally suggests.
- **Half-days of a finished month that have not reached `Validated`** — revenue the chain cannot
  invoice yet.

The third has a hard blocker in this repository: **there is no deadline anywhere in the dataset.**
No table carries a submission cut-off, no ADR sets one, and the firm's policy on when a `Cra` is due
is not something this mockup was told. Inventing "the 5th of the following month" would put an
authoritative-looking number on a screen, derived from a rule nobody agreed to.

## Decision

**A late day is one recorded half-day of a `Cra` whose `Period` has closed and whose `CraStatus` is
not `Validated`.** The counter is the sum of those half-days for the month the pré-facturier is
showing, and it is displayed in days (`frenchDays`), like every other quantity.

Four things this pins down:

- **The clock is consulted once, for one question: has the month ended?** A period is closed when
  its last day is strictly before today in `Europe/Paris` (`lastDayOf` against
  `isoDateInFirmTimeZone`, so the boundary does not move with the server's timezone). The month
  still running shows a counter of zero and says so — nothing recorded this month is late, because
  nothing this month is due.
- **`Draft`, `Submitted` and `Refused` all count.** Every one of them is a half-day that a closed
  month has not turned into revenue, which is the thing being measured. What differs is **who is
  holding it**, and the screen says that per row rather than splitting the total: `Draft` and
  `Refused` are with the consultant, `Submitted` is with the manager. A counter that excluded
  `Submitted` would let a month sit unvalidated for a quarter and report nothing.
- **It counts half-days, not people.** The pré-facturier's subject is billable volume, and one
  consultant with a full month outstanding is not the same problem as three consultants with a day
  each. The number of rows in the table is already the count of people.
- **It is scoped to the actor like everything else.** It is summed over the `Cra`s the repository
  returned, so a manager's counter is their office's and never another's. No separate query, and
  therefore no second place the scope rule could be forgotten.

`CONTEXT.md` gains **LateDays** and **Pré-facturier** in the same commit — the second because this
task puts the word in a URL, a page title and a file name, and BUILD-RULES does not let a term reach
code before it is in the vocabulary.

## Rejected option

**Count days elapsed past a submission deadline** — the reading the phrase most naturally carries,
and the one a consulting firm actually runs on: "Cra due the 3rd, we are the 11th, you are eight
days late."

It loses on the absence above, and the absence is the argument rather than an excuse for it. A
deadline is **firm policy**, not a derivable fact: it differs by firm, sometimes by client contract,
and it is exactly the sort of number that makes a mockup look like it knows something it does not.
Inventing one would put a fabricated obligation on the screen and, worse, would make the counter
_look_ authoritative — the failure mode this repository spends its ADRs avoiding. Adding a
`submission_deadline` to reference data was available and was refused for the same reason: seeding
a policy is still inventing it.

**Count late `Cra`s rather than late half-days.** Simpler, and genuinely more actionable for a
manager. It loses on where the counter sits: the pré-facturier's question is what is billable, and
its unit throughout is the half-day (ADR-0012). A screen whose every other quantity is in days,
carrying one headline figure in people, invites the reader to add them.

**Count everything not yet validated, closed month or not.** One fewer dependency — no clock at all.
It loses because it is never zero and therefore says nothing: on the 12th of the month, every day
recorded so far is "late" by that definition, and a counter that is always red is a counter nobody
reads.

## Reconsideration threshold

Reopen the moment a submission deadline enters the dataset as **agreed** policy — an HR calendar, a
client contract clause, a firm rule someone signs off. At that point the elapsed-days reading is the
right one, it becomes computable rather than invented, and this counter becomes its input rather
than its replacement.

Reopen sooner if the screen ever needs to distinguish "late and worth chasing" from "late and
already escalated". That is a state a `Cra` does not have, and adding it would mean the counter has
outgrown being derived from `CraStatus`.

## Consequences

**Easy.** The counter needs no new table, no deadline, no configuration and no second scope rule: it
is a sum over rows the screen already loaded, gated on a single comparison against the clock. It is
honest about a month in progress, which is the case a naive definition gets wrong.

**Expensive.** `CraListItem` grows `recordedHalfDays` so the sum does not require loading every
`Cra` in full (ADR-0053), which widens a projection two other callers read and ignore. And the
number is silent about _how_ late — a month outstanding since March and one outstanding since July
count the same. That is the price of not inventing a deadline, and the threshold above is where it
stops being worth paying.
