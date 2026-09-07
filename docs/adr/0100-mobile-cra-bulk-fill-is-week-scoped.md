# ADR-0100 — Mobile CRA bulk fill is scoped to the visible week

- **Date**: 2026-09-06
- **Status**: accepted
- **Amends**: ADR-0099, mobile bulk entry and day disclosure defaults

## Context

ADR-0099 made individual quantities usable on a phone but left out the desktop row tools.
A routine month still requires roughly twenty native select interactions. Desktop deliberately
offers its month-wide row tools only beside the month total; mobile always shows one week.

## Decision

Above the mobile day cards, offer an activity picker and “Remplir cette semaine”. Apply the
existing `fillEmptyWorkdays` helper to workable dates in the visible calendar week, clipped to
the current month. The picker includes assigned missions before they have a matrix row, plus
Absence. Preview the number of affected days using the same helper; disable a fill with no effect.
Preserve the chosen activity between weeks. Reuse the matrix snapshot undo and name the activity
and date range beside the mobile action. Saving and submission still write the whole month.

When the month has no entered quantities, promote the existing previous-month preview above the
week navigator. Name its source month and keep the preview/confirmation path: this is the existing
mission-based fill proposal, not a claim to copy the previous month's exact calendar or absences.

Use native `details` for every mobile day, including the manager's read-only cards. Complete days
and empty non-workable days start collapsed; incomplete and overbooked days stay visible by
default. Summaries retain the date, total, flags and activity dots with accessible activity names.
Explicit disclosure choices survive week navigation. A day being edited stays open when completed
so its focused native select does not disappear. Missing-day navigation opens the target before
focusing it. No domain, endpoint, gesture or quantity-control changes.

## Rejected option

**Month-wide mobile fill.** One tap saves several week actions but changes dates outside the
visible total. A label, month progress bar and undo reduce that surprise without removing it.
Keep the explicit month-wide previous-month preview for users who can reuse their missions.

**Collapse immediately after every full-day entry.** It hides the focused control and makes
split-activity corrections harder. Automatically collapse bulk-filled or loaded days instead.

**Swipe, drag, or a numeric bottom sheet.** These add gestures and focus management without
addressing the missing bulk action. Native quantities retain ADR-0070/0099's interaction contract.

## Reconsideration threshold

Revisit month-wide fill if observed mobile use shows repeated weekly filling remains a material
obstacle and users need it independently of the previous-month proposal. Require an explicit
month preview before extending the scope. Revisit summary density when activity dots no longer
fit alongside a date and total at 360px.
