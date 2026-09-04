# ADR-0089 — A scrollport is a containing block

- **Date**: 2026-09-04
- **Status**: accepted

## Context

The shell is one fixed-size box — `routes/_shell.tsx` renders `flex h-dvh overflow-hidden` around
a `<main class="flex-1 overflow-y-auto">`. The document is therefore not supposed to scroll at all,
on either axis, and anything wider than the viewport is supposed to scroll inside its own
`overflow-x-auto` container: the CRA month grid, a `DataTable`.

That last part was a convention nothing had ever written down. `business-timeline.tsx` calls it
"the rule every wide element in this app follows"; `components/ui/table.tsx` implements it;
`cra-matrix-table.tsx` implements it. No ADR stated it and neither does
`docs/direction-visuelle.md`, whose layout section stops at "sticky header inside a scroll area on
the grid". An unwritten rule that three components independently obey is exactly the kind that
breaks quietly, which is what happened.

None of it held. Measured on `fix/qa-round-3-mobile` before this decision, on the real seeded
database:

| Screen                     | Width | `document.scrollWidth` | `document.scrollHeight` | viewport |
| -------------------------- | ----- | ---------------------- | ----------------------- | -------- |
| `/cra/2026-06` (Alice)     | 1024  | 1615                   | —                       | 1024     |
| `/pre-facturier` (Bruno)   | 375   | —                      | 2545                    | 812      |
| `/tableau-de-bord` (Bruno) | 375   | —                      | 1464                    | 812      |

`window.scrollTo(600, 0)` moved the viewport; scrolling past the end of `main` on Pré-facturier
kept going into blank space. Both were reported by hand as QA round 3 items 34 and 35, as two
separate complaints.

They are one defect. Tailwind's `sr-only` is `position: absolute`, and an absolutely positioned
element whose containing block lies _above_ a clipping ancestor is not clipped by it. Nothing
between an `sr-only` span and the initial containing block was positioned, so every
screen-reader-only `<caption>` and label resolved against the ICB and extended the document's own
scrollable area. Isolated empirically rather than reasoned about: hiding the CRA scrollport
returned the document to 1024px, setting `overflow-x: hidden` on it did **not**, and
`position: relative` on it did.

This had already been found once, from the other end. `cra-quantity-cell.tsx` carries a comment
about sixty-two `sr-only` labels doing exactly this, dodged by using `aria-label` instead. Item 26
of this same round then replaced the visible "Week-end"/"Jour férié" column text with `sr-only`
spans, and reopened it.

## Decision

The rule, now written down: **wide content scrolls inside its own container and the page never
scrolls — so every element that establishes a scrollport is `position: relative`.** Concretely, in this
codebase: `<main>` in `routes/_shell.tsx`, the CRA matrix's own region in `cra-matrix-table.tsx`,
and `components/ui/table.tsx`'s wrapper, which already was.

Both of the first two are load-bearing and neither implies the other. With only `<main>`'s, the CRA
grid's 1509px table would be contained _into `main`_ — which computes `overflow-x: auto` — and the
shell would pan sideways instead of the document: the symptom moves, it does not go away.

`apps/web/e2e/responsive.spec.ts` asserts the two invariants across four widths and every read-only
screen. Reverting either fix fails it (17 of 20 for `<main>`, 3 of 20 for the CRA scrollport, and
not the same three).

## Rejected option

**Ban `sr-only` inside a scrollport and use `aria-label` everywhere**, which is what
`cra-quantity-cell.tsx` did the first time and which works. It loses on two counts. It is a rule
about markup that nothing checks, so it survives exactly as long as everyone remembers it — item 26
is the proof, written after that comment existed. And it is not always available: an `sr-only`
`<caption>` on a table has no `aria-label` equivalent that reads as well, and the non-workable-day
labels item 26 added are per-cell content, not a name for a control.

A second alternative, `contain: paint` on each scrollport, was measured and works identically. It
was rejected as a heavier tool with side effects (it also contains layout and style in some engines)
for a problem whose whole cause is a containing block.

## Reconsideration threshold

Reopen if a scrollport in this app ever needs to host an absolutely positioned descendant that must
escape it — a popover anchored inside a scrolling table, say, that has to overflow the scrollport's
edge. That is a real pattern, and at that point the fix is a portal (which every Radix overlay in
this app already uses) rather than an unpositioned scrollport; if a portal cannot serve it, this
ADR is wrong for that component and needs a successor.

## Consequences

Cheap: `sr-only` becomes safe anywhere. The accessibility work item 26 did — colour carrying meaning
visually, the same meaning reaching a screen reader as text — no longer trades against layout.

Expensive: nothing measurable, but `position: relative` on a scrollport silently changes the
containing block for any absolutely positioned descendant added later. A component that positions
something against the page from inside a scrollport will now position it against the scrollport
instead, and will do so without an error. `responsive.spec.ts` does not catch that class of
mistake; a reviewer has to.
