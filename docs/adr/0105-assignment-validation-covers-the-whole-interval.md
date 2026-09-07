# ADR-0105 — Assignment validation covers the whole interval

- **Date**: 2026-09-07
- **Status**: accepted

## Context

`validateAssignment` (`apps/api/src/staffing/assignment-admin.ts`) checked a departure and a
required `Habilitation` at the wrong grain: two hazards, reproduced with isolated fixtures.

**Departure.** `if (departure !== null && (from >= departure || (to !== null && to >= departure)))`
never compared an **open** end (`to === null`) to anything. A consultant departing 2026-07-15,
assigned from 2026-07-01 with no end date, passed — an unbounded assignment reaches every future
day by construction, and a known departure date means at least one of those days is not staffable,
but the code had no branch that said so.

**Habilitation.** The check asked `TimesheetReference.missingHabilitations` about exactly two
instants — `from`, and `to` (or a `9999-12-31` sentinel for an open end) — because that function
answers "is this **one day** covered", which is the right question for a Cra submission check (one
recorded day at a time) and the wrong one here: an assignment spans every day of `[from, to]`, and
checking only the endpoints missed a habilitation held July 1–5 and renewed July 20–31 with no
coverage July 6–19, for an assignment spanning the whole month.

## Decision

**Departure**: `from >= departure || to === null || to >= departure` — an open end is refused
whenever a departure is known, on the same `>=` ADR-0079 already uses ("departure is the first
date the consultant is no longer staffable", so the departure day itself refuses). No other
comparison in this function changed; the fix is the missing branch, not a new interpretation.

**Habilitation**: a new local function, `fullyCovers(periods, from, to)`, reads the consultant's
raw dated `consultant_habilitations` rows for each habilitation the mission requires — not through
`TimesheetReference`, which has no interval-shaped question to ask — sorts them, and walks them
once, merging touching or overlapping periods and tracking the last day known continuously covered
from `from`. A period whose start is more than one day past that running total is a gap, refused
immediately; reaching or passing `to` (or `Number.POSITIVE_INFINITY` for an open end, on both the
target and a period) accepts. One pass, no recursion, `O(n log n)` for the sort and `O(n)` for the
walk, where `n` is the number of dated periods a consultant holds for one habilitation — small by
construction (a handful of renewals, not thousands).

This lives in `apps/api/src/staffing/`, not in `packages/timesheet/src/domain/`: assignment
administration is composition-root orchestration already doing its own raw SQL against `public.*`
in this same file (the overlap check, the recorded-days check), not part of the sealed `timesheet`
module's pure domain. It answers a different question than `TimesheetReference` does — "is this
whole span covered", not "is this one day covered" — so it does not belong behind that interface at
all, sealed module or not.

## Rejected option

**Extend `TimesheetReference` with an interval-coverage method** (`habilitationCoverageGaps` or
similar), so the sealed domain answers the same question this file now answers itself.

Rejected because the two questions serve genuinely different callers with different shapes: a Cra
submission check asks about one recorded day and gets a boolean-shaped answer per line
(`runSubmissionChecks` calls `missingHabilitations` once per worked day); assignment validation
asks about one span once. Adding the span-shaped method to the domain interface for a caller that
lives outside the domain, to avoid one local function in `apps/api`, would grow the domain's public
surface for a consumer the domain does not need to know about — the same reasoning BUILD-RULES
gives for not introducing a port before a second real implementation needs one.

**Checking every individual day of `[from, to]`** with the existing point-in-time
`missingHabilitations`, in a loop. Correct, but `O(days)` calls where the merge-and-scan is
`O(periods)` — a year-long open assignment is 365+ point checks against a handful of held periods
for no benefit, and the loop still has to reconstruct the same "was there a gap" answer the merge
already gives directly.

## Reconsideration threshold

Reopen if a second caller outside `apps/api/src/staffing/` needs the same interval-coverage
question — at that point the duplicated local function becomes the second source of truth this
decision is currently avoiding by not sharing across `packages/`.

## Consequences

- `createAssignment`/`updateAssignment` refuse an open-ended assignment against a known departure,
  and refuse a habilitation with a covered-then-gap-then-covered-again pattern for any part of the
  assignment the gap falls in — both reproduced as failing tests before this decision's fix and
  passing after (`apps/api/src/staffing/assignment-admin.int.test.ts`).
- `assignment-admin.ts` and `assignments.int.test.ts` (HTTP-level: access control, malformed
  bodies, wrong role, wrong office) had no test coverage before this decision; both files exist
  now, closing the gap the audit named explicitly ("a repository-wide search found no direct tests
  of the assignment routes or their create/update functions").
- The departure/habilitation checks are unchanged for every case that already worked: a bounded
  assignment ending before departure, a habilitation held continuously, and a mission requiring no
  habilitation at all are unaffected.
