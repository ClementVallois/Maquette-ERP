# ADR-0067 — The grid write is refetch-driven, not optimistic

- **Date**: 2026-08-25
- **Status**: accepted

## Context

`PUT /api/v1/cras/:period/entries` answers `{ craId, status, flags }` — it does not return `lines`.
Phase 6.3 asks for "Optimistic UI avec rollback sur problème," and the phase's own exit Gate (J1)
requires proving "éditer un créneau → Enregistrer → rouvrir, la modification persiste" — a claim
only a real read after the write can honestly make, because the value the grid would show ahead of
that read is a guess about what the server did with the entries it was sent.

That guess is not free to make correctly. `apps/api/src/chain/record-month.ts`'s `linesOf`
collapses two identical half-day entries into one two-half-day line and otherwise keeps entries as
separate one-half-day lines, in day order. Rendering the _result_ of a save optimistically, before
the response exists, means re-implementing `linesOf`'s grouping on the client — a second copy of
the exact rule ADR-0066 already accepts one duplication of (the read-side slot mapping) and does
not extend to the write side, on purpose: `PUT`'s response gives no `lines` to have gotten right or
wrong against, so a wrong optimistic guess would only be caught by the refetch this ADR decides to
do anyway.

## Decision

Enregistrer and Soumettre both call the same mutation (`PUT`, `submit` toggled), and on success the
grid's query (`['cra', 'grid', period]`) is invalidated and refetched — the in-memory slot state is
then rebuilt from the server's own answer, not carried forward from what the consultant last
typed. The two buttons show a pending state for the whole round trip (write, then the read that
follows it); the toast fires once the refetch settles, with a verb matching the action pressed
(`LABELS.cra.savedToast` "Enregistré" / `LABELS.cra.submittedToast` "Soumis" — added to
`labels.ts`, since only the imperative forms "Enregistrer"/"Soumettre" existed before this phase).
A failed mutation shows the refusal inline (`lib/problems.ts`'s classification) and leaves the
in-memory edit exactly as the consultant left it — there is nothing to roll back, because nothing
was applied ahead of the server's answer.

## Rejected option

**Optimistic local update of the in-memory slot map, with rollback on error.** Rejected because
there is nothing to be optimistic about _correctly_: the value that would need to appear ahead of
the server's answer is the post-`linesOf` shape, which this screen has no way to compute without
duplicating that function a second time (beyond the read-side mirror ADR-0066 already accepts). An
optimistic value that then silently "corrects itself" once the refetch lands would read as a bug
during the CEO demo this build exists for, not as responsiveness.

## Reconsideration threshold

If `PUT /api/v1/cras/:period/entries` starts returning the saved `lines` — a contract change with
its own decision to make first — optimism becomes both cheap and correct, and this ADR should be
revisited. Until then, the latency being hidden is one Postgres round trip against a seeded local
or demo database, not a network hop worth spending rollback logic on.

## Consequences

**Easy.** No rollback path, no place where "what I clicked" and "what is stored" can diverge: one
`invalidateQueries` call per successful mutation is the entire cache strategy for this screen, and
Phase 6's own persistence proof (save → reopen → the edit is there) is exactly what this strategy
produces for free.

**Expensive.** The save button stays pending through both the write and the read that confirms it,
so a slow connection is felt directly rather than hidden behind an optimistic flash. Acceptable for
a mockup demonstrated against a local or lightly-loaded seeded instance; named here so it is not
mistaken for an oversight later.
