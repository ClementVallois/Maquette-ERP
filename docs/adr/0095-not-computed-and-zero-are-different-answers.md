# ADR-0095 — "Not computed" and "zero" are different answers

- **Date**: 2026-09-04
- **Status**: accepted

## Context

A `Cra` can be validated from two places. The CRA detail view
(`apps/web/src/features/cra/components/manager-cra-grid-screen.tsx`) opens `ValidateConfirmDialog`
with `flaggedDaysCount={flaggedDays.size}` — the count of days worked on a weekend or a public
holiday, which item 28 of QA round 3 promoted out of a plain `<dl>` row into a loud warning banner
precisely because it is the one fact on that dialog a manager must not skim past. The pré-facturier's
own row-level "Valider" button (`features/pre-facturier/components/pre-facturier-screen.tsx`) opens
the same dialog and passes nothing, because `PreFacturierCraRow`
(`apps/api/src/composition/pre-facturier.ts`) never runs the submission checks per row: it is a
lightweight paginated summary, by design and for a reason — the page can be large.

The prop was `flaggedDaysCount?: number`, and `undefined` rendered nothing. So did `0`. Two paths to
the same irreversible act — a validated `Cra` is immutable — one of which warns and one of which is
silent, with nothing on screen distinguishing "this month has no flagged day" from "nobody looked".

`docs/open-questions.md` carried this as an Open row dated 04/09/2026, with three candidate
resolutions: compute the count per row, cache it, or remove the warning from the detail dialog so
both paths agree.

## Decision

**The count is not computed for the pré-facturier, and the dialog says so.** `flaggedDaysCount`
becomes `number | null` and **required**:

- `> 0` — the warning banner, unchanged;
- `0` — nothing, unchanged;
- `null` — a muted advisory, in the dialog, stating that flagged days are not computed in this list
  and that the CRA should be opened before validating.

Required rather than optional is the load-bearing half. An optional prop lets a future caller
inherit "no warning" by saying nothing, which is exactly how this defect arrived; a required
nullable one makes every caller state which of the two it means, and the type checker asks.

The advisory is **plain text with no link**. A navigation link inside a confirmation dialog discards
the decision the dialog is asking for; the pré-facturier row already carries its own link to the CRA
detail view, one row away.

## Rejected option

**Compute `flaggedDaysCount` per row** — the answer that removes the asymmetry rather than
disclosing it. It loses on cost, and the cost is not hypothetical: a flag is derived from a `Cra`'s
lines against the working calendar, so a page of fifty rows is fifty line-loads and fifty calendar
resolutions on a screen whose whole shape (ADR-0003's cap, ADR-0081's raised cap for
`GET /api/v1/cras`) exists because these lists got long. Caching it moves the cost without removing
it and adds an invalidation question — a `Cra` edited between two pré-facturier reads would show a
stale count on the dialog that gates its validation, which is worse than showing none.

**Remove the warning from the CRA detail dialog**, so both paths agree. Rejected on direction: it
makes the two paths consistent by degrading the one that was right. The row listed it as a live
alternative; it is closed here rather than left standing.

## Reconsideration threshold

Reopen when `PreFacturierCraRow` starts carrying line-level data for another reason — a per-row
day-type breakdown, an inline preview. At that point the flags are a projection of data already
loaded, the cost argument above evaporates, and the honest resolution becomes the rejected one.

Reopen also if a third caller of `ValidateConfirmDialog` appears that would pass `null`. Two callers
disagreeing is an asymmetry worth disclosing; three is a sign the dialog is being reused across
screens with genuinely different data, and the successor is a per-screen dialog rather than a
nullable prop.

## Consequences

Cheap: no new query, no cache, no cost on a page that can be large, and the silent difference
becomes a stated one. The pré-facturier stays the summary it was designed to be.

Expensive: the application now tells a manager, at the moment of an irreversible act, that it has
not checked something — which is honest and is also friction, deliberately placed on the faster of
the two paths. A manager who validates from the list and ignores the advisory is in exactly the
position they were in before; the difference is that they were told.
