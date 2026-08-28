# ADR-0061 — Accessibility is held mechanically, and it is not an RGAA conformance claim

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` § 6.7 asks for "full keyboard navigation, form labels, contrast. No RGAA
audit, and that limit is written down." This is where it is written down, and the reason it needs
an ADR rather than a README line is that the two halves pull in opposite directions and both are
true.

**Accessibility is not decoration here.** An internal ERP is used all day, by people who do not
choose it; in France a firm of this size has obligations towards employees with disabilities that
an internal tool either supports or obstructs. And the mechanical half is nearly free on
server-rendered HTML with no client framework (ADR-0009): the elements are the semantics.

**And a conformance claim is not free at all.** RGAA 4.1 is 106 criteria, audited on a sample of
pages by someone competent to do it, with a published declaration of conformity carrying a
percentage. Producing that for a mockup would be a claim about a document nobody wrote.

The failure mode this ADR exists to prevent is the one in between: a repository that says
"accessible" because it added `aria-` attributes, which is how a reader is told something the code
does not support.

## Decision

**What is held is mechanical, tested, and small. What is not held is named.**

Held, and asserted by `accessibility.test.ts` on rendered markup rather than promised in prose:

- **One document language** (`<html lang="fr">`), so a screen reader pronounces it.
- **A skip link before the header**, first in the tab order, visible only on focus.
- **A visible focus ring that is never removed** — `:focus-visible` with a 3px outline. An
  invisible focus ring is the single most common way full keyboard navigation is lost, and it is
  lost by a stylesheet rather than by markup.
- **Every form control has a label**, visible or `sr-only`. The entry grid is the case that forces
  the rule: 62 selects, whose visible labels would drown the grid they explain.
- **Every data table has header cells with `scope`**, row headers included, so a cell is announced
  with what it is about. In a table of nine consultants, "Marge" without its row header is nine
  identical links.
- **Repeated link text carries its context in an `sr-only` span**, for the same reason: a screen
  reader's list of links is read out of table order.
- **No `title` attribute is load-bearing.** It is not exposed on touch, not focusable, and not
  announced consistently; where it appears it repeats something already on the page.
- **Contrast** is a property of the palette rather than of a component, which is why there is one
  palette and it is at the top of the single stylesheet.

**Not held, and stated in the README rather than left to be discovered**: no RGAA audit, no
conformance declaration, no assistive-technology testing (no NVDA, JAWS or VoiceOver run), no
`prefers-reduced-motion` handling (there is no motion), no verified contrast ratio — the palette
was chosen for contrast and no measurement is published, so the number is not claimed.

## Rejected option

**Run the RGAA criteria and publish a declaration.** It is the thing a French public-facing tool
would owe, and a cybersecurity firm's internal tool is exactly the sort of application where
somebody asks. It loses on competence and on honesty: doing it properly means an auditor, a sample,
and a published percentage, and doing it improperly produces a declaration that is worth less than
no declaration — a reader who trusts it is worse off than one who was told nothing.

**Add ARIA attributes generously to look thorough.** The tempting cheap option, and the one that
actively harms: `aria-label` on an element that already has an accessible name replaces it, and a
wrong `role` overrides working native semantics. On server-rendered HTML with no framework the
right amount of ARIA is nearly none, and every attribute used here is one a test asserts a reason
for.

**Say nothing, and let the markup speak.** It would be defensible — the markup _is_ mostly right.
It loses because "mostly right and unstated" is indistinguishable from "unconsidered", and this
repository's whole argument is that the difference between the two is written down.

## Reconsideration threshold

Reopen when the screens are used by anyone other than a demo audience — a real internal user, a
pilot, a deployment inside a firm. At that point the obligation is real, the sample exists, and the
audit is the next task rather than an expensive gesture.

Reopen sooner if a screen ever gains a control that native HTML does not provide — a combo box, a
tree, a modal, a drag-and-drop grid. That is where ARIA becomes necessary rather than decorative,
and where "the elements are the semantics" stops being true. ADR-0009's threshold (client-side
series entry on the Cra grid) is the same event seen from the other side.

## Consequences

**Easy.** The claims are checkable: a test reads the rendered pages and fails if a control loses
its label, if a table loses its header scopes, if the focus rule leaves the stylesheet, or if the
skip link stops being first. Those are the regressions that happen silently, and they now happen
loudly instead.

**Expensive.** The list of what is _not_ held is longer than the list of what is, and it goes in
the README where a reader will see it. That is the intended cost: an accurate short list is worth
more than a long claim, and the alternative was a percentage nobody measured.
