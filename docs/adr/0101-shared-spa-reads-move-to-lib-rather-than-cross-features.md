# ADR-0101 — A read two SPA features need moves to `lib/`, rather than one feature importing the other

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Item 4, QA round 6: `/factures` filtered by year through a raw `<Input type="number">` while `/cra`
filtered by year through a Radix `Select` fed by the working calendar's own year coverage
(`GET /api/v1/calendar`, ADR-0004). The reporter asked for one control, `/cra`'s, on both screens.

Extracting the control is not the decision. The decision is where its data comes from. `useCalendar`
lived in `features/cra/hooks.ts`, so the obvious move — have `features/factures` import it — would
have added the **second** cross-feature import in this SPA, and `docs/open-questions.md`'s row dated
24/08/2026 is open on exactly that question: the SPA's `src/features/` folders mirror the sealed
`packages/` modules by name, `dependency-cruiser`'s allowlist grants `apps/([^/]+)/ → apps/$1/` so
any intra-app import cruises green, and the one crossing that exists (`cra → factures`, for
`InvoiceListItem`) was corrected by hand in review rather than by a gate. That row names three
honest options — leave it as discipline, add a `forbidden` rule with a named exception, or retire
the mirror-by-name expectation in an ADR — and defers the choice until the real number of crossings
is visible.

This change would have made that number two, and would have made the second crossing an
`api.ts`/`hooks.ts` dependency rather than a single type — a materially worse arrow than the one the
row describes, decided on the way to a filter widget.

## Decision

**A read that two features need is neither duplicated nor imported across a feature boundary: it
moves to `apps/web/src/lib/`.** `CalendarResponse`, `fetchCalendar` and `useCalendar` now live in
`apps/web/src/lib/calendar.ts`; `features/cra` imports them from there like any other consumer, and
`components/year-filter-select.tsx` — the shared control — calls `useCalendar()` itself rather than
taking `years` as a prop, so neither screen has to know where the years come from.

`lib/` is already where this SPA keeps cross-cutting machinery that is not a feature:
`query-client.ts`, `api-client.ts`, `period.ts`, `use-reduced-motion.ts`. A React Query hook there is
not a new category.

The count of cross-feature imports therefore **stays at one**, and the 24/08 row stays open on its
own terms rather than being resolved by accident.

## Rejected option

**Import `useCalendar` from `features/cra` into `features/factures`.** It is one line, it cruises
green, and it is the reason the 24/08 row exists. The repository's headline claim is "real module
boundaries, enforced by CI — not naming conventions" (`CLAUDE.md`); the SPA's own boundary is
currently discipline, and discipline that is relaxed the first time it is inconvenient is not
discipline. The cost of the alternative is one file move, which is why the argument for crossing is
weak here specifically — not why crossing is always wrong.

**Keep the control presentational and pass `years` in from each screen.** This looks more
"reusable", and it is the shape a component library would take. Rejected because it moves the
problem rather than solving it: `features/factures` would still need the years, so it would still
need `useCalendar`, so it would still have to import it from somewhere — and the somewhere was
`features/cra`. It also duplicates the same three lines of `calendar.data?.years ?? []` fallback at
every call site, which is what a shared control exists to stop.

## Reconsideration threshold

**A third feature needing the same read, or a read that is genuinely one feature's own domain being
pulled into `lib/` to dodge an import.** The first is a signal `lib/` is working; the second is the
failure mode — `lib/` becoming the place anything shared goes, which is a junk drawer, not a
boundary. If `lib/` starts accumulating feature-specific reads, the right answer is the 24/08 row's
option (b): a real `forbidden` dependency-cruiser rule between feature folders, with named
exceptions, so the boundary is a gate rather than a convention this ADR restates.

## Consequences

**Easy.** One year filter, one behaviour, two screens: a change to the offered years, the sentinel,
or the out-of-range guard happens once. The out-of-range guard is itself a consequence of sharing —
`/factures`' search schema admits any year in 2000–2100 while the calendar covers 2016–2027, so a
bookmarked `?year=2035` is a value the control has to render rather than silently blank; it is
spliced into the offered list the same way `SingleSelectCombobox`'s `alwaysInclude` keeps a selected
option present. Verified in the browser, not reasoned about.

**Expensive.** `lib/` now holds a hook that issues a network read, which is a slightly bigger claim
than "utilities": a reader looking for where `/api/v1/calendar` is called no longer finds it under
the feature that first needed it. The file's own header says why it moved, and this ADR is the
record — but the indirection is real, and it is the price of not crossing.

**Not solved by this ADR**: the SPA feature boundary is still unenforced. Nothing stops the next
change from adding the second crossing; `docs/open-questions.md`'s 24/08 row remains open, and this
decision narrows it (the crossing count is still one, and one option — extract to `lib/` — is now
demonstrated) rather than closing it.
