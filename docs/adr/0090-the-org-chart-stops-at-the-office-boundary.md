# ADR-0090 — The org chart stops at the office boundary

- **Date**: 2026-09-04
- **Status**: accepted

## Context

QA round 3, item 18, asked for a "team" panel on the dashboard: a consultant sees their manager, a
manager sees their direct reports. Nothing exposed that. `PgReferenceReader.hierarchy()` existed but
was write-side only — `validate-cra.ts` and `refuse-cra.ts` use it to decide who may accept a Cra —
and `GET /api/v1/consultants` (ADR-0077) answers an office roster, not who reports to whom.

Reading it out loud turns out to be a decision, not a lookup, because the two things disagree in the
data. `scripts/lib/seed-data.ts` carries `manager_attachments` rows that cross offices: Gabrielle
works in Bordeaux and reports to Bruno in Paris; François works in Rennes and reports to Emma in
Lyon. Those rows predate offices scoping anything — the seed's own comment is the flat "Each
consultant reports to a manager."

Every other read in this application is bounded by `actor.officeId`. `PgCraRepository.list` filters
on it; `/api/v1/consultants` filters on it; a manager asking for a Cra outside their office gets a
403 that names the rule (`/problems/out-of-scope`, ADR-0042). CLAUDE.md's proof point 3 states the
requirement as "a manager in one office cannot read the margin of a mission in another office, and a
test proves it."

So "who reports to me" has two defensible answers, and they differ by two people in the seed.

## Decision

**A manager's reports are the intersection: their own office's current roster, narrowed to the
people the hierarchy attaches to them today.** `GET /api/v1/team` computes
`consultantsOfOffice(actor.officeId)` and keeps those whose `managerOn(id, today)` is the actor.
`forRoles('consultant', 'manager')` — billing is refused, because the one billing persona is the
_director_ every manager reports to, not a subject of this chart.

Gabrielle therefore does not appear for Bruno. That is the point: a team panel that reached past the
office would be the single screen in this app that shows a name the rest of the API refuses to serve
— Bruno cannot read her Cra, cannot see her in the pré-facturier, and cannot open her margin.
Showing her in "my team" would advertise a person he can do nothing with.

`departure_date` is excluded by `consultantsOfOffice` already (ADR-0079), so a consultant who has
left is absent from the panel while her historical Cras and invoices stay readable — the two halves
are asserted separately in `apps/api/src/routes/team.int.test.ts`, because a "filter departed people
out everywhere" change would pass the first and break the second.

Each of the three filters — office, hierarchy, departure — was removed in turn and the suite re-run:
each removal fails at least one test.

## Rejected option

**Answer the hierarchy as it is recorded, ignoring the office** — i.e. every consultant whose
`managerOn` is the actor, wherever they work. It is the more literal reading of "direct reports",
and it is what an org chart in a real HR tool would show.

It loses here because this mockup's authorization story is office scope, stated as a proof point and
tested as one. An endpoint that answers "these five people are yours" and four other endpoints that
answer "you may not read anything about two of them" is not a richer product; it is an inconsistency
a reviewer would rightly call out at the demo. If the office boundary is the wrong model, the fix is
to change the boundary everywhere, not to make one new panel the exception.

## Reconsideration threshold

Reopen when either becomes true:

- the firm's model gains a real notion of a manager whose team spans offices (a practice lead, a
  regional director) — at which point office scope stops being the right authorization boundary and
  ADR-0042's own rule is what needs revisiting first, not this one;
- or the seed stops carrying cross-office attachments, in which case this decision is untestable by
  construction and `team.int.test.ts`'s fixture, which builds its own, becomes the only place the
  distinction is visible.

## Consequences

Cheap: the panel cannot leak. It reuses two readers that were already scoped, adds no SQL, and
inherits ADR-0079's departure rule for free.

Expensive: the app now states two different answers to "who is Gabrielle's manager" — the hierarchy
says Bruno (and only Bruno may validate her Cra), the office scope says nobody Bruno can see. Nobody
can actually validate her Cra through the UI. That is a pre-existing seed/model tension this ADR
makes visible rather than creates; it is recorded as its own row in `docs/open-questions.md` with the
phase that will decide it.
