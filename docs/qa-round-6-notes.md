# QA round 6 notes — filters and search

Worked on `feat/qa-round-6-filters-and-search`, branched from `main`. One commit per item.

- Groundwork: `/affectations` gained a `validateSearch` (`view`, `staffing`), modelled on
  `factures.index.tsx`'s own search schema — the view filter moved from local `useState` into the
  URL ahead of items 2 and 3, both of which need it there.
- Item 1: the assignment screen's mission picker is now a `SingleSelectCombobox`, searchable by
  client or mission name, reusing the same component the consultant picker already uses.
  `assignmentFormRefusal` gained a `'mission'` case so removing the native `<select required>`
  does not reintroduce the silent-no-op bug that case's `'consultant'` sibling already guards.
- Item 2: the assignment list's "En cours / Toutes" pair became four `TogglePillGroup` pills
  (En cours / À venir / Terminées / Toutes), each with a count, the three status buckets summing
  to the fourth by construction (a new `isEnded` alongside the existing `isCurrent`/`isUpcoming`).
- Item 3: the manager dashboard's staffing chart legend entries are now `Link`s into
  `/affectations?view=current&staffing=on-mission|intercontrat` (the `<rect>`s stayed inert —
  clickable there would be keyboard-unreachable inside the `role="img"` svg). The assignment
  screen replicates `managerStaffingSnapshot`'s per-consultant precedence client-side
  (`staffingBucketOf`) rather than filtering assignment rows by mission name, and shows a
  removable banner naming the bucket's consultant count when the filter is active.
- Item 4: `CalendarResponse`/`fetchCalendar`/`useCalendar` moved from `features/cra` to the
  neutral `lib/calendar.ts`, and the year `Select` `/cra` already had was extracted to
  `components/year-filter-select.tsx` with an out-of-range guard for a bookmarked year. `/factures`
  now uses it in place of its raw `<Input type="number">`; `/cra`'s own month picker is unchanged.

Found by driving the four items in a browser after the coding pass, and fixed in the same branch:

- `LABELS.invoice.allYears` was `'Toutes'`. That read fine as the `placeholder` of a captioned
  number input; as the entire visible text of a `Select` trigger sitting above a status pill that
  also says "Toutes", it did not. Now `'Toutes les années'` — the same string `/cra` shows, which
  is what the `w-48` trigger was sized for.
- The staffing banner interpolated a bare `{count} consultants` and read "1 consultants" for a
  bucket of one; split into `One`/`Many` at the call site.
- "Effacer ce filtre" rebuilt the search as `{ view: 'current' }`, discarding a view picked after
  arriving through the deep link; it drops `staffing` alone now.
- The invoice filter bar keeps a visible "Année" caption (`aria-hidden`, since the trigger carries
  its own accessible name) rather than going caption-less next to a captioned search field.

Verified in a browser against the seed: mission search narrows and the cleared mission raises a
visible refusal; pills read 20 + 0 + 1 = 21; the chart's 12 Intercontrat and 7 En mission each open
a view whose banner names the same number, with no Intercontrat row in the on-mission list; the
invoice year `Select` offers 2016-2027, filters, and still reads correctly for a bookmarked
`?year=2035` the calendar does not cover.

`apps/web/tests/visual/review/*.png` were deliberately **not** regenerated: they are human-review
artifacts refreshed in their own `chore(web)` commits, and re-capturing them here would rewrite all
26 for renderer differences rather than for the three screens this branch actually changes.
