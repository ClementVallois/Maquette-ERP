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
