# ADR-0091 — The Cra read port gains an open-ended period bound

- **Date**: 2026-09-04
- **Status**: accepted

## Context

QA round 3, item 22, asked the manager dashboard's two count cards to link to the list of what they
count. "CRA en attente de décision" maps onto a filter that already existed (`statuses=submitted`).
"CRA en retard" did not map onto anything.

`lateCras` (`apps/api/src/routes/api.ts`) is _not validated **and** the period has closed_ —
`status !== 'validated' AND lastDayOf(period) < today`. `CraListQuery` could express one exact year,
one exact month, or one exact period. It had no way to say "every month before this one", which is
the second half.

The trap this item exists for: these counts are deliberately not scoped to the displayed period
(ADR-0082), while the Cra list defaults to one. A link that carried the dashboard's `year`/`month`
through would show a card reading 3 over a list showing 1.

## Decision

**`CraListQuery` gains `beforePeriod`: an exclusive upper bound on `period`, with no lower bound.**
It is carried end to end — the domain port (`packages/timesheet/src/domain/cra-repository.ts`), one
`c.period < $N` clause in `PgCraRepository`'s `list` and `count`, `CraListParams` on
`GET /api/v1/cras`, and `cra.index.tsx`'s search schema — and the dashboard's "en retard" card links
with `statuses=draft,submitted,refused&beforePeriod=<current period>`, omitting `year`/`month`
entirely rather than leaving them at their displayed value.

The comparison is plain text. `period` is `YYYY-MM`, which sorts lexically exactly as it sorts
chronologically, including across a year boundary (`'2025-12' < '2026-01'`) — asserted, not assumed.

This is a **read-side query capability**, in the same shape as the `year`/`month` filters item 4 of
QA round 2 added, not a new domain invariant. Nothing in the domain decides anything differently
because of it.

The equivalence to `lateCras` is the thing that actually has to hold, so it is tested as an equality
rather than described: `apps/api/src/routes/api.int.test.ts` asserts that the dashboard's count and
the list its card links to return the same number, on the same fixture.

## Rejected option

**Compute the cut-off client-side** — fetch the list unfiltered and drop the current-and-later
periods in the browser. It is smaller and touches no domain code.

It loses on pagination. `GET /api/v1/cras` is capped (ADR-0081 raised it to 200); a client-side
filter narrows the page it happens to have received, so the count and the list desynchronise the
moment an office has more Cras than one page — which QA round 1's own roster expansion already made
true for Paris and Lyon, and which `docs/open-questions.md` records for the pré-facturier's period
selector for exactly the same reason. It also duplicates a rule the server already owns: two
definitions of "late" that must be kept equal by hand is the shape of every drift bug in this
codebase's history.

A second alternative — a `periodRange: { from, to }` object rather than a bare bound — was rejected
as speculative. Nothing in the chain needs a lower bound, and an optional field with two optional
halves is harder to read in SQL than one nullable comparison.

## Reconsideration threshold

Reopen the _shape_ when a second range bound is needed — a screen asking for "between March and
June" — at which point `beforePeriod` becomes one half of a range object and the two should move
together rather than accumulate as sibling scalars.

Reopen the _mechanism_ if `period` ever stops being `YYYY-MM` text (a real `date` column, a period
value object with its own ordering). The text comparison is correct only because of that
representation, and it is the one line that would silently keep compiling and start being wrong.

## Consequences

Cheap: the card and its list cannot disagree, and the filter is expressible in a URL, so the deep
link is a plain `<Link search={…}>` with nothing computed on arrival.

Expensive: one more optional field on a read port that now carries five of them (`year`, `month`,
`period`, `statuses`, `beforePeriod`), each an independent `IS NULL OR` clause in the same query.
That query is readable at five; it will not be at ten, and the successor is a query object the
repository interprets rather than a widening parameter list.
