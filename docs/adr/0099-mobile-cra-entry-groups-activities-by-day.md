# ADR-0099 — Mobile CRA entry groups activities by day

- **Date**: 2026-09-05
- **Status**: accepted
- **Amends**: ADR-0070, presentation below the existing `md` breakpoint only

## Context

The user requested a usable CRA entry screen at 360 × 760, including the manager's read-only
view. Even seven date columns require sideways scrolling and truncated mission names at this
width. The weekly matrix no longer meets the requested mobile presentation.

## Decision

Below `md`, render vertical day cards with the activity name beside its quarter-day quantity,
a daily total, and the existing incomplete, overbooked and non-workable indicators. The consultant
keeps week navigation. The manager reads the month in chronological order using the same cards.
Empty weekends and holidays are expandable; entering a quantity keeps that day visible. Mobile
native quantity selects use 44px targets and French day quantities. Their keyboard behaviour is
native; the desktop matrix retains its arrow-navigation contract.

The matrix remains the local state and the whole month remains the unit of write. Assignment
eligibility, flags, totals, missing-day focus and read-only status come from the existing inputs.
There is no new endpoint or business rule. Desktop month/week matrices keep their row operations.

## Rejected option

Keep shrinking the weekly table: the activity labels and touch controls already compete for the
same 360px. A separate day editor behind a modal would add a round trip for every date and hide
neighbouring totals; inline cards let the user scroll through those totals directly.

## Reconsideration threshold

Revisit when simultaneous activities make a single day card taller than a phone viewport, or
mobile users need month-wide row operations as frequently as desktop users. Consider an activity
filter or explicit month tools then, without changing the write contract.
