# ADR-0004 — The working calendar is a domain component with a written holiday table

- **Date**: 2026-08-17
- **Status**: accepted — its table extended from 2026 alone to 2016–2027 by
  [ADR-0078](./0078-the-holiday-table-extends-to-2016-2027.md) (31/08/2026), on this ADR's own
  reconsideration threshold. The decision below is unchanged; only the span of the table moved,
  and the title said "fixed 2026" until that happened.

## Context

A Cra records a month. What may be billed is the set of days actually worked, so the application has
to know which dates are workable: weekends, French public holidays, and the days a consultant is
absent. Get this wrong and the invoice is wrong — this is not a formatting concern.

French public holidays are not a fixed list. Three of them (lundi de Pâques, Ascension, Pentecôte)
move with Easter, which is computed rather than looked up.

Absence is in scope **as a kind of day on the Cra**. Leave management — requests, approval, balances,
carryover — is not, and goes in the README's "what I am not building".

## Decision

A `WorkingCalendar` lives in the domain, in pure TypeScript, with its own tests. It answers "is this
date workable" for Europe/Paris, and it is the only authority on that question.

Public holidays for **2026 are a hardcoded table**, written out and tested date by date, rather than
computed from a movable-feast algorithm.

A day carries a `DayType` (worked, absence, public holiday, weekend). Only worked days reach an
invoice.

## Rejected option

**Computing Easter** (Meeus/Butcher or similar) to derive the movable holidays. It is the general
solution and it is about twenty lines. It loses because the mockup covers a single year: the
algorithm would be code that is never exercised beyond one value, harder to review than the eleven
dates it produces, and a place for a bug that no test in scope would catch. A written table is
verifiable by reading it.

**A holiday library.** Rejected on dependency weight for something the scope needs eleven values
from, and on supply-chain grounds — a dependency added for a lookup table is a poor exchange.

**Treating the calendar as a date utility.** It would drift into a helpers file with no tests. It is
the component that decides what may be billed, so it belongs in the domain with the invariants.

## Reconsideration threshold

The day the mockup spans **a second calendar year** — including a Cra for December 2026 validated in
January 2027. At that point the table must either be extended deliberately or replaced by the Easter
computation, and the calendar should fail loudly on a year it does not know rather than silently
treating an unknown holiday as a working day.

Also reopen if the firm's offices stop sharing one holiday calendar (Alsace-Moselle has two extra
days; overseas offices differ).

## Consequences

Proration and billable-day counts have one source of truth, tested without a database.

Because the domain may not read the system clock (a lint rule enforces it, time comes from an
injected `Clock`), calendar-dependent behaviour is deterministic in tests — which is what makes the
seed data reproducible and the demo repeatable.

The cost is an explicit dated boundary: the calendar is correct for 2026 and knows nothing else. The
threshold above is the reminder, and the failure must be loud.
