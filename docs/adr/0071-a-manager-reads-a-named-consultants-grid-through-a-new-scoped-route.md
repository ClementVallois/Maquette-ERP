# ADR-0071 — A manager reads a named consultant's grid through a new, scoped route

- **Date**: 2026-08-26
- **Status**: accepted

## Context

`docs/frontend-plan.md`'s Phase 6 gave the consultant a matrix (`GET /api/v1/cras/:period/grid`),
but a manager who opens `/cra` today sees the office's months with no name on the row and no way to
open one: `apps/web/src/features/cra/components/cra-list-screen.tsx`'s own header comment says why
— the grid route is `forRoles('consultant')` and derives the consultant from the actor, never from
the path, so a manager's click would be a guaranteed `insufficient-role`. Clement wants the reverse:
a manager sees their consultants, picks one, and opens that consultant's CRA, read-only.

Two candidates exist, and the gap between them is what this ADR names.

**`GET /api/v1/cras/:id`** already exists, is already manager-readable (`forRoles('consultant',
'manager', 'billing')`), and is already office-scoped: `PgCraRepository.findById` calls
`assertMayRead(actor, 'cra', { officeId, subjectId })`, which throws `OutOfScopeError` for a manager
of another office. It returns `lines`, `flags`, `status`, `validatedBy`. It does **not** return
`missions[]` (so a line's `missionId` has no name to render) or `days[]` (the calendar skeleton —
only days that were actually recorded exist in `lines`, so a mostly-empty month renders as a mostly-
empty table rather than a full month with blanks). Reusing it would mean either duplicating the
mission-name and calendar-skeleton logic client-side (a business fact — which days a month has,
which mission a `missionId` names — computed twice, in two places, which is exactly what
`docs/BUILD-RULES.md` § Boundary and layering rules out for a business fact anywhere near a React
component) or shipping a visibly worse screen than the one the consultant's own CRA gets.

**`GET /api/v1/cras/:period/grid`**'s own composition, `craGridComposition`
(`apps/api/src/composition/cra-grid.ts`), already computes exactly the missing two things — the
month's calendar skeleton and the staffed missions with `assignableDays` — but hard-codes
`actor.consultantId` as the consultant whose month it reads. There is also a second cost this
composition is exempt from and `GET /api/v1/cras/:id` is not: a caller reaching `:id` has to
_already know_ a Cra's id, which does not exist for a month nobody has saved yet — exactly the
month a manager might legitimately want to check is still empty. `craGridComposition` already
answers that case (`craId: null`, an empty grid, not a 404).

**A third fact decided the direction, not just the cost comparison.** Reading
`PgCraRepository.findByConsultantAndPeriod` while evaluating the reuse path surfaced a gap neither
candidate closes for free: the method's `assertMayRead` call only runs _after_ a matching row is
found (`if (rows.length === 0) return null` comes first). A manager asking about a consultant with
**no Cra yet this month** — the exact case this task exists to support — would never reach the
scope check at all. Composed with a route that also resolved that consultant's missions
(`PgReferenceReader.timesheet()`/`missionNames()`), that gap would leak mission and client names for
a consultant outside the caller's office, for any month that consultant has not yet saved — worse
than the missing feature it would replace. Closing it is this ADR's decision, not a side effect of
it.

## Decision

**Reuse `craGridComposition`, generalised, behind a new route: `GET
/api/v1/consultants/:consultantId/cras/:period/grid`, `forRoles('manager')`.**

- `CraGridInput` gains an explicit `consultantId: ConsultantId`, read from the path on the new route
  and from `actor.consultantId` on the existing one — the composition itself no longer assumes the
  caller and the subject are the same person.
- The composition resolves the target's `officeId` from `public.consultants` first (one query, the
  same shape `consultant-economics.ts` already uses for the identical problem) and calls
  `assertMayRead(actor, 'cra', { officeId, subjectId: consultantId })` **before** touching
  `findByConsultantAndPeriod` or either reference-reader call. This is the fix named above: the
  scope check no longer depends on a Cra row existing, on either route. A consultant id matching no
  row in `public.consultants` at all resolves to `null`, which the route turns into a 404 — the
  ADR-0003 distinction between "does not exist" and "exists, not yours" holds for a subject as well
  as for a Cra.
- The manager route additionally resolves `displayName` off the same query, so the screen can title
  itself with the consultant's name without a second round trip.
- The manager's screen renders the response with editing **forced off** regardless of the payload's
  own `editable` field: `editable` there still answers "could the consultant edit this", which is
  true for a `draft` or `refused` month and irrelevant to a manager, who never edits anyone's CRA
  (BUILD-RULES: separation of duties, and this task's own instruction — "a manager's view of
  someone else's CRA is read-only"). No wire change was needed for this: it is a rendering decision,
  made once, in the one component both routes' screens do not share.
- `GET /api/v1/cras` (already office-scoped for a manager) gains a `consultantName` per row on the
  wire, resolved the same way the pré-facturier already resolves it —
  `PgReferenceReader.consultantNames()`, merged onto the existing, unmodified `CraListItem` read.
  This is presentation, not a rule (the same justification `consultantNames()`'s own doc comment
  already gives), so it needs no ADR of its own; it is named here only because it is the data the
  manager's row now has a name to show and a button to act on.

## Rejected option

**Extend `GET /api/v1/cras/:id` with `missions[]` and `days[]`, and have the manager's screen reuse
that route instead of a new one.** Rejected for the reason in Context: it either duplicates a
business fact (which mission a `missionId` names, which days a month has) into a second place, or
still needs a server round trip to resolve those two things anyway — at which point it is
`craGridComposition` under another name, minus the part of `craGridComposition` that already handles
"no Cra yet". It would also have to invent its own answer to "how does a manager address a month
with no Cra id yet", since `:id` has no such month to be `:id` of.

**Add a `consultantId` query parameter to the existing `GET /api/v1/cras/:period/grid` instead of a
new path.** Rejected because the existing route's whole contract is "no consultant id on the path,
because it is always the caller's own month" (its own route comment, and
`docs/open-questions.md`'s row dated 25/08/2026, which named this exact ambiguity for a future
phase). Overloading one route to sometimes read the path and sometimes read a query parameter, for
two different roles with two different write permissions on the same URL shape, is the confusion a
second, explicit path avoids.

## Reconsideration threshold

Reopen if `billing` ever needs the same read: today only the brief's "a manager" is asked for, and
`billing`'s own `cra: 'office'` scope in `packages/platform/src/scope.ts` would make it a one-line
`forRoles` change with no new authorization logic — but until a real screen needs it, adding the
role would be exactly the anticipatory permission `docs/BUILD-RULES.md` rules out.

## Consequences

**Easy.** `craGridComposition`'s two DB round trips (missions, calendar) do not double: both routes
call the same function, so a genuine change to how a month's missions are resolved is one edit, not
two kept in step by hand. The negative test this ADR owes — a manager of another office refused,
naming the rule — is materially the same test `consultant-economics.ts`'s own `assertMayRead` call
already has a passing precedent for, which is why the fix could be dated with confidence rather than
guessed at.

**Expensive.** The composition's signature changed (`CraGridInput` gained `consultantId`), which
touches both call sites and their tests — `apps/api/src/routes/api.ts`'s existing grid route had to
be re-read to confirm passing `actor.consultantId` explicitly changes nothing about its behaviour,
not merely assumed safe. `apps/web` gains a second grid-reading hook and a second route
(`/cra/$period/$consultantId`) that render through the same body component in two different
`editable` postures — one more seam than a single-route screen would have had, and the one this ADR
judged worth it rather than the duplication the rejected option would have shipped instead.
