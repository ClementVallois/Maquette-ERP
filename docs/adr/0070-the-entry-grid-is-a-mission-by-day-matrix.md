# ADR-0070 — The entry grid is a mission × day matrix, and one cell is one `CraLine`

- **Date**: 2026-08-26
- **Status**: accepted

## Context

The grid shipped in Phase 6 is one row per day and two controls per row — morning and afternoon —
each choosing _what_ was done: nothing, Absence, or one of the staffed missions. That shape is a
direct rendering of the half-day: two boxes, because a day held two things.

ADR-0069 removes that premise. A day now holds four quarter-days, so the same shape would mean four
pickers per row, 124 of them in a long month, each still choosing a mission by name in a control the
width of a table cell. It also fails to express the thing a quarter-day exists for: a cell would say
_which_ mission, never _how much_.

The transposed shape is what the firm's own tool uses, and the reason is not aesthetic. Three of the
four operations a consultant actually performs on a month are **row** operations — fill the rest of
the month with this mission, empty this mission's month, drop this mission from my sheet — and one
is a **column** operation: does this day add up to one? Neither exists as a gesture when the mission
is a value inside a cell rather than the identity of a row. A day-per-row grid can only offer
"change this box", 124 times.

There is a second, quieter gain. With missions on rows, `(row, day)` is unique, and a cell maps
**one-to-one** onto a `CraLine` — the domain's own `(day, dayType, missionId, quantity)`. That is
exactly the grouping `linesOf` (`apps/api/src/chain/record-month.ts`) performs server-side today,
which means the client stops needing a conversion at all: ADR-0066 exists solely to mirror a
slot-fill rule whose whole purpose was to reconstitute, on the way in and on the way out, an order
the domain never stored. When the display shape equals the storage shape, the mirror has nothing to
mirror.

## Decision

`/cra/$period` renders a **matrix**: one row per activity, one column per day of the month.

- **Rows.** One per mission the consultant is staffed on during the month, plus one `Absence` row.
  A mission with nothing recorded is not shown by default; "Ajouter une activité" adds it from the
  missions the read already returns. A row can be added mid-month — a mission that starts on the
  15th is staffed for the month and therefore offered — and the days it is not assignable on are
  rendered as unavailable rather than left to fail at submission.
- **Columns.** Every day of the period, workable or not, in one horizontal scroll region. Weekend
  and public holiday are the calendar's answer (`days[].nonWorkable`), rendered and never blocking:
  the server flags, it does not forbid.
- **Cells.** A cell holds a quantity in quarter-days — empty, `¼`, `½`, `¾`, `1` — and nothing else.
  It is a native `<select>` of five options, for the reasons ADR-0068 gave and which survive its
  supersession intact (many simultaneous controls, a keyboard contract that needs a reliable
  open/closed signal), with its OS chrome removed: a cell of a grid reads as a cell, not as a form
  control repeated 124 times. Invalid input is unrepresentable rather than validated.
- **Two totals, both read from the same local state.** A per-day total row under the grid, and a
  per-row month total at the end of each row. The per-day total is the one that carries meaning: it
  turns the two invariants the domain already holds — `DayOverbookedError` above one day,
  `IncompleteCraError` below it at submission — into something visible while typing, in the place
  where the mistake is made.
- **The write is unchanged in kind** (ADR-0050): the whole month is posted, refetch-driven and not
  optimistic (ADR-0067). What changes is the entry: one per **non-empty cell**, carrying its
  `quarterDays`, which is the line the server would have grouped anyway. `MAX_ENTRIES` becomes
  `4 × 31 = 124` — still the longest month at its maximum density, still a bound reached by the
  rule and not only by the schema.

The per-day total is **display of a domain answer, never a second rule**. The grid does not decide
what a full day is: it shows a sum and marks it against `QUARTER_DAYS_PER_DAY`, and the refusal, if
one is due, comes from the domain at submission with its own typed error and its own list of days.

## Rejected option

**Keep one row per day, four cells per row.** The smallest diff — the existing screen, one control
wider. It loses on the operations: filling a month, emptying a mission, and reading "does the 12th
add up" are all row-or-column gestures against a matrix, and against a day-per-row grid they are
either impossible or a loop over 124 controls. It also keeps the mission inside the cell, which is
what forces every cell to be a picker wide enough for "Audit PASSI — Banque Pop." instead of a cell
wide enough for "½".

**A day-detail panel: click a day, edit its four quarters in a side sheet.** Genuinely better for
one complicated day, and worse for the month, which is the unit being filled. It replaces a
scannable surface with 31 round trips through a panel, and it hides exactly the fact a consultant
opens the screen to check — which days are still not full.

**A free-text cell** (`1`, `0,5`, `,25`). Fastest to type for someone who knows the format, and it
reintroduces parsing, a locale (the comma), an invalid state per cell, and an error message per
cell — 124 opportunities to be told you typed it wrong, to save a keystroke against a list of five
options.

**Keep `slots.ts` and map the matrix back onto slots.** Rejected as a mirror of a mirror: the
slot-fill rule ADR-0066 ported client-side exists to rebuild an ordering the domain never kept, and
the matrix already stores what the domain stores.

## Reconsideration threshold

Reopen when a consultant is staffed on enough simultaneous missions in one month that the rows stop
fitting on a screen without vertical scrolling — the point where "one row per activity" stops being
a summary of the month. In this firm's data that is roughly eight; a consultant with eight active
missions in a month has a staffing problem, not a UI problem, but the screen would need grouping or
a filter and that is a design decision, not a tweak.

Reopen also the day a day can carry something that is not a quantity — a comment, an on-call
window, a client reference per cell. A cell that holds two facts is not a cell any more, and the
day-detail panel rejected above becomes the right shape.

## Consequences

**Easy.** `apps/web/src/features/cra/slots.ts` and its tests are deleted rather than ported:
`slotsFor`/`entriesFor` have no job once the display shape is the storage shape, and with them goes
`LABELS.cra.slotsNote` — the sentence apologising to the consultant for not keeping the
morning/afternoon order they typed. The row tools ("remplir les jours ouvrés vides", "vider la
ligne", "retirer la ligne") are pure local-state operations over one row of the matrix, expressible
in a few lines each precisely because a row is now a thing.

**Expensive.** The keyboard contract gets a second dimension: arrows must move across days as well
as between activities, and the grid scrolls horizontally, so a focused cell has to be scrolled into
view rather than merely focused. The axe budget for this screen is spent on a table that is wider
than the viewport — a `scope`-ed header row of 31 dates, a row header per activity, and a caption
that names the month — which is more structure to get right than the previous grid needed and the
reason the accessibility check stays a gate on this phase rather than a polish item.

Two ADRs are superseded and one is not: ADR-0066 (the client-side slot mirror) and ADR-0068 (the
slot control) both lose their subject; ADR-0050 (the whole month is the unit of write) and
ADR-0067 (refetch-driven, never optimistic) are untouched, and this grid is their second caller
rather than their replacement.
