# ADR-0078 — The holiday table extends to 2016–2027

- **Date**: 2026-08-31
- **Status**: accepted

## Context

ADR-0004 fixed the working calendar's threshold explicitly: "the day the mockup spans a second
calendar year… the table must either be extended deliberately or replaced by the Easter
computation, and the calendar should fail loudly on a year it does not know rather than silently
treating an unknown holiday as a working day." Item 6 (QA round 1) is that day: the seed dataset
grows sparse historical CRAs and invoices back to 2016, and a manager or consultant is meant to
open one of them in the UI. `workingCalendar()` today knows only 2026 — any date outside it throws
`UnknownCalendarYearError`, which is correct behaviour but means every 2016–2025 date the seed
would write is presently unrecordable, not merely unbilled.

Two branches existed at the threshold, exactly as ADR-0004 named them: extend the written table,
or replace it with a computed Easter algorithm now that more than one year is in play (amortising
the "twenty lines for one year" cost ADR-0004 rejected the algorithm on). The algorithm's case is
stronger with twelve years than with one, but ADR-0004's second reason for the written table —
"a written table is verifiable by reading it," "harder to review" for a formula whose output a
reviewer cannot check by eye — does not weaken with more years; it strengthens, since a computed
table's failure mode (a subtly wrong Easter for one specific year, in a table with no obvious
single point to inspect) gets _harder_ to catch by inspection as the table grows, not easier.

## Decision

**Extend the written table, unchanged in kind, to 2016–2027.** `PUBLIC_HOLIDAYS_2026` is renamed
`PUBLIC_HOLIDAYS` (`packages/timesheet/src/domain/working-calendar.ts`) and now holds 132 dates —
the same eleven French public holidays, for each of twelve years — computed offline (Easter
Sunday, then the three movable feasts as fixed offsets from it) and pasted into the source
verbatim, the same way the original eleven were. `workingCalendar()`'s behaviour is otherwise
unchanged: `years` is still derived from the table it is handed, not named as a constant, and
`UnknownCalendarYearError` still fires on any date outside the table's coverage — 2028 today,
where 2027 was the boundary before this ADR. The span is 2016 (the seed's own historical floor,
item 6's own arbitration) through 2027 (one year past 2026, so a Cra opened in January of the
following year — the same reasoning ADR-0004's own example gave for "a second year" — does not
immediately need a second extension).

Every call site of the old export name moved in the same commit:
`packages/timesheet/src/index.ts`'s re-export, `working-calendar.test.ts`'s import, and a doc
comment in `apps/api/src/routes/dashboard.int.test.ts` that named the old export informally.
`GET /api/v1/calendar`'s own contract test (`apps/api/src/routes/api.int.test.ts`) already asserted
`toContain(2026)` rather than `toStrictEqual([2026])`, anticipating exactly this — it needed no
change.

The test that pinned "the three movable feasts fall on the weekday they must" moved from asserting
three hardcoded 2026 dates to asserting the shape for every year the table holds: among each
year's eleven dates, the three that do not match one of the eight fixed `MM-DD` suffixes are the
movable feasts, and among those three, exactly two are Mondays (Easter Monday, Whit Monday) and
exactly one is a Thursday (Ascension) — checked by weekday, not by array position, because the
three are not always in the same relative order within a year (2027's Ascension, 6 May, falls
before that year's fixed 8 May Victoire 1945, which every other year in this table has the other
way around).

## Rejected option

**Compute Easter at runtime** (Meeus/Butcher or equivalent) instead of extending the written
table, described in Context. Rejected on the same grounds ADR-0004 gave, now stronger rather than
weaker with twelve years in play: a formula's output is not independently checkable by reading it
the way a table of dates is, and a wrong value for one specific year among twelve has no obvious
place a reviewer would look. The eleven-holidays-per-year invariant the tests now assert (every
year in `calendar.years` has exactly eleven entries, exactly three of them movable, exactly two of
those on a Monday and one on a Thursday) is precisely the check a computed table would still need
and a written one gets from being enumerable.

## Reconsideration threshold

The day the mockup needs a date outside 2016–2027 — a Cra earlier than 2016 (item 6's own floor
for historical data, so no seed row should ever ask for one) or a Cra for 2028 or later (the
demo's own wall clock, 2026, would need to advance two full years past the table's own margin
before this fires). At that point, extend the table again, by the same method, or revisit the
Easter-computation trade-off named above — twelve years of enumerated cross-checks is closer to
"worth verifying an algorithm against" than the original eleven ADR-0004 judged were not.

## Consequences

**Easy.** The shape of `WorkingCalendar` does not change: `years`, `isWeekend`,
`isPublicHoliday`, `isWorkable`, `nonWorkableReason`, `workableDaysOf` all read the same way they
did for one year. `UnknownCalendarYearError`'s loud refusal, the behaviour ADR-0004's threshold
specifically asked to keep, needed no code change — only a wider table for it to check against.

**Expensive.** The table itself is five times longer and five times more of it to keep correct by
eye if a thirteenth year is ever added by hand rather than pasted from a verified source the way
this one was — the "verifiable by reading it" claim scales worse than the "twenty lines" the
rejected algorithm would have cost, which is the trade-off this ADR is explicit about rather than
silent on.
