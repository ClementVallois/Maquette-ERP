# ADR-0097 — One call to action per actionable Cra, on the consultant dashboard

- **Date**: 2026-09-04
- **Status**: accepted

## Context

Item 2, QA round 5: a consultant whose current month is `validated` but who also has an earlier
month sitting `refused` saw **three** "open this Cra" prompts stacked on one screen —

1. the `WorkQueue` "à faire maintenant" row `consultantQueue` already builds for every period in
   `refusedPeriods` other than the one on display, each with its own "Ouvrir ce CRA" link;
2. `ActionCard`, driven by `callToAction(data)`, always shows a sentence and a button for the
   **current** period specifically — "Votre mois est validé. Ouvrir mon CRA" in this case, a
   different fact (this month, not the refused one) and a different label ("Ouvrir mon CRA", not
   "Ouvrir ce CRA");
3. `RefusedElsewhereNotices`, a destructive `Alert` rendered underneath `ActionCard`, which read
   `data.refusedPeriods` a second time and rendered the exact same fact and the exact same
   "Ouvrir ce CRA" link `consultantQueue` already had.

Only (1) and (3) are the duplicate — same fact, same label, same destination, twice on one screen.
(2) is `ActionCard`'s own always-present summary of the period actually being viewed, worded and
scoped differently, and item 2 leaves it alone.

`RefusedElsewhereNotices`'s own comment said the duplication was deliberate: "kept for the visual
weight a refusal deserves beyond one queue row among others." **This is not a decision ADR-0082
made.** ADR-0082's Decision section governs `refusedPeriods`' own _read_ — `cras.list` with no
period filter, so a refusal is not lost the moment the calendar turns a page — and says nothing
about how many places the front end renders that field once it has it. `refusedPeriods` and the
route that computes it are unchanged by this ADR; the rendering choice a later commit's own comment
attributed to ADR-0082 is what this ADR replaces.

## Decision

**`RefusedElsewhereNotices` is deleted. The `WorkQueue` row is the one surface for a refusal on a
period other than the one displayed.** It is where every role's other actionable work already
lives (a manager's pending decisions, billing's oldest drafts), so a refusal joining it is
consistent with the rest of the screen rather than a special case that also gets its own banner.
`ActionCard`/`callToAction` is untouched: it still names whatever the currently-displayed period's
own status is, on every visit, regardless of what else is refused elsewhere.

## Rejected option

**Keep the Alert, remove the queue row instead.** Rejected: the queue is the one list every role's
"à faire maintenant" work already goes through, and pulling this one case out of it would make the
queue lie by omission — a consultant with two refused months elsewhere would see one of them queued
and the other only in a banner, for no reason a reader could name.

**Keep both, on the reasoning the Alert's destructive red carries weight a plain queue row does
not.** This is the trade this ADR actually makes, named rather than dropped silently: a refusal
does lose a highlighted, red, immediately-eye-catching treatment it had. It keeps the "Ouvrir ce
CRA" queue row exactly where every other actionable fact on this screen already reads, which is
what "one call to action" in the brief asks for; a screen that visually shouts about a fact once is
still telling the truth once, which two quieter, disagreeing volumes never quite were on this
screen — they were two _identical_ copies, not one loud and one quiet version of two different
things.

## Reconsideration threshold

**The day a refusal needs to be visually distinguished from an ordinary pending item in the same
queue** (a real user report that it gets lost among submissions and validations, not merely a
stylistic preference) is the day the queue row itself earns a distinguishing treatment — a colour,
an icon, a `variant` — rather than reopening a second, separate banner that duplicates it.

## Consequences

**Easy.** One component, its three imports (`Alert`, `AlertAction`, `AlertDescription`) and its
call site are gone from `dashboard-screen.tsx`; nothing else in the file referenced them.
`apps/web/e2e/journeys.spec.ts`'s item 5 test (the one that reproduces exactly this scenario) is
updated to assert against the `WorkQueue` `listitem` instead of the removed `alert` role — the
route, the label and the destination it clicks are all unchanged, only the container it looks
inside for them.

**Not solved by this ADR**: a consultant with several months refused at once still sees several
queue rows, one per period, with no grouping or count — acceptable today because the seed never
produces more than one, and out of scope for a fix nobody has asked for yet.
