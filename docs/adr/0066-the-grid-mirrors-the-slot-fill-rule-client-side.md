# ADR-0066 — The grid mirrors the slot-fill rule client-side, and never persists a slot index

- **Date**: 2026-08-25
- **Status**: superseded by ADR-0070

## Context

`docs/frontend-plan.md` Phase 6.2 renders the month as two boxes per day (matin/après-midi), the
same shape `apps/api/src/web/pages/cra-grid.ts`'s SSR screen already renders. `GET
/api/v1/cras/:period/grid` does not expose that shape: it answers `lines` as the domain holds
them — one `CraLine` per one-or-two-half-day fact, with no slot number, because ADR-0050 §2
already refused to let the API declare a field the code would never read ("a `slot` field here
would be a value the code declares and never reads, which in this repository is a defect rather
than a nicety"), and removed exactly that field in commit `131a31d`.

So the SPA has to do, for itself, the same conversion `gridDays` (`apps/api/src/web/routes.ts`)
already does for the SSR page: turn `lines` into two slots per day for display, and turn an edit
to those two slots back into entries for `PUT /api/v1/cras/:period/entries`. Two behaviours of
that conversion are load-bearing and easy to get quietly wrong in a second, independent
implementation:

1. Two half-days of the same day, same type, same mission are **one line of two half-days**, not
   two lines of one — `apps/api/src/chain/record-month.ts`'s `linesOf` groups them, and the reverse
   direction must fill **both** slots with the same value when it sees that one line.
2. A day recorded as a single half-day always displays in the **first free slot**, in the order
   `lines` holds them — never "whichever slot the consultant originally typed into," because
   nothing on the wire says which slot that was. `LABELS.cra.slotsNote` already tells the
   consultant this in French: "L'ordre matin/après-midi n'est pas conservé, parce qu'il ne change
   ni la facture ni les totaux."

A round trip that gets either wrong is not a crash — it is a value silently moving from one box to
another, which is exactly the failure `docs/BUILD-RULES.md`'s "a green gate that stopped looking"
warns about, and precisely the risk this phase's own briefing named before any grid code was
written.

## Decision

Port `gridDays`'s per-day slot-fill loop into `apps/web/src/features/cra/slots.ts` as two pure
functions: `slotsFor(lines, day)` (read direction, one call per day) and `entriesFor(days)` (write
direction, the whole month at once). Both are unit-tested under Vitest against the two behaviours
above by name — an identical-halves day collapses to both slots holding the same value on read,
and a lone half-day entry always reads back into slot 0 regardless of which slot produced it.

This is a **deliberate duplication**, not a shared import: `apps/web` imports only
`@erp/contracts` (`docs/frontend-plan.md` §2), and Annexe C.8 already commits `labels.ts` and
`format.ts` to the same pattern ("des copies … pas d'import cross-app"). The comment at the top of
`slots.ts` names `gridDays` and `linesOf` by path, so a reader who changes either knows there is a
second place to check.

## Rejected option

**Persist which slot (0 or 1) a half-day was entered into**, so the round trip is lossless and
needs no normalisation on either side. Rejected because ADR-0050 §2 already closed this door on
the API side and removed the field in commit `131a31d` for a stated reason — a value nobody reads
is a defect, not a convenience. Reintroducing it only on the client would mean the API silently
drops whatever the client sends, which is a worse, quieter trap than the one this ADR accepts:
`slots.ts`'s two tests document the actual behaviour where a hidden field would have hidden it.

## Reconsideration threshold

If a second SPA screen or a second client (a native app, a CLI) needs the same day→slots mapping,
factor `slotsFor`/`entriesFor` into a fixture both sides import, rather than trust a third
independent implementation to stay in step by inspection. If `linesOf`'s grouping rule on the API
changes, `slots.ts`'s two named tests are exactly what should fail first — if they do not, the
mirror has already drifted.

## Consequences

**Easy.** The mapping is roughly twenty lines, pure, and independently testable without a
database, a browser, or a mounted component — the two behaviours this ADR names are asserted once
each, by name, rather than left to be discovered against a real seed during Playwright's J1.

**Expensive.** Nothing fails automatically if the server's `gridDays`/`linesOf` algorithm changes;
a person has to notice and update `slots.ts` by hand. This is the same cost already accepted, and
already named, for `labels.ts` and `format.ts`.
