# ADR-0034 — One dated-reference mechanism, resolved at the close of the period

- **Date**: 2026-08-18
- **Status**: accepted

## Context

Two facts of this chain change over time and are read about the past.

The **`Tjm`** is dated: work done in June bills at June's rate, whatever the rate is when the
invoice is drafted. `BUILD-RULES.md` already states it as an invariant. The **manager attachment**
is dated for the same structural reason: a consultant changes team in June, and the Cra of March is
still March's manager's to accept — validating it in July does not transfer the decision to whoever
runs the new team.

They are the same question — _what was true on this date_ — asked about two different values, in
two different modules. Two implementations of it means two sets of boundary conditions (inclusive
or exclusive ends, overlaps, gaps, ordering), diverging quietly, in the two places where being
wrong costs money or bypasses a control.

A second question hides inside the first, and only appears once the mechanism exists: a Cra covers
a **month**, not a day. Resolving "the manager" for a month means picking a day, and a move
mid-month makes the choice visible.

## Decision

**One mechanism in the shared kernel**: `Timeline<T>`, a list of `Effective<T>` entries with an
inclusive `from`, an inclusive `to` that is `null` while the value is in force, and `at(date)`
returning the value or `null`. It is built through a factory that **refuses overlapping periods**
and a period that ends before it starts, and it holds gaps without inventing a value: a date with
no entry answers `null`, never the nearest neighbour.

The manager attachment (`timesheet`) and the dated `Tjm` (`billing`, Phase 2) are both this type.
That placement follows ADR-0033 — the shape lives in the kernel, the data in each module — and it
is what makes "the same code" a fact rather than an intention.

**A period resolves at its last day.** `managerOf(consultant, March)` is `managerOn(consultant,
31 March)`. The manager in place when the month closed is the one who accepts the month.

The inclusive-`to` convention is deliberate and matches `Assignment` and mission end dates: a
reader who has to hold two conventions in mind will apply the wrong one.

## Rejected option

**Resolving against the validation date** — "who is Nadia's manager today?". Simplest, one lookup,
no timeline. It loses on the case the feature exists for: a Cra validated late, after a team move,
would be accepted by a manager who never saw the work. That is not a data-quality detail — it is
the control of ADR-0006 being applied by the wrong person.

**Resolving a month at its first day.** Symmetrical and equally defensible, and the two answers
differ only when someone moves mid-month. It loses on the intuition of a closing: a month is
accepted after it ends, by whoever is responsible for the consultant at that point. The rejected
option is recorded because it is a coin-flip that has to be written down — an undocumented choice
here is a bug report in three months.

**Resolving day by day**, so a Cra spanning a move is validated by two managers, each for their
part. Genuinely more correct, and rejected on scope: it makes validation partial, which contradicts
ADR-0005's single terminal transition and would split the invoice as well. The threshold below
names when it becomes right.

**A resolution helper per module.** Rejected on the divergence argument above: the two copies would
be edited by different tasks in different phases.

## Reconsideration threshold

Reopen if a Cra ever has to be **validated in parts** — per mission, per week, or by two managers
across a move. That is the day-by-day option, and it changes the Cra lifecycle, not just this
resolution.

Also reopen if a timeline needs to answer about an **instant** rather than a day — an attachment
that changes at midday — or if gaps stop being data errors and need a documented fallback.

## Consequences

One implementation, one set of tests for the edge cases, and both users get the same answers:
inclusive bounds, no overlap, no invented value in a gap.

The overlap refusal is what makes the answer deterministic. Two entries covering one date would
resolve by iteration order, which is the kind of bug that reproduces on one machine out of two.
It is checked per consultant, because two managers on one day is normal across people and a data
error within one person.

The cost is that the seed must produce clean timelines — no overlap, no accidental gap — and a
gap answers `null`, which surfaces as "nobody may validate this Cra" rather than as a silent
fallback. That is the intended failure: loud, and pointing at the data.
