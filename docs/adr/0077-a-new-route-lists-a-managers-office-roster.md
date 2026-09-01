# ADR-0077 — A new route lists a manager's office roster, for the consultant filter's options

- **Date**: 2026-08-31
- **Status**: accepted

## Context

Item 7 (QA round 1) asks for a consultant filter on `/cra`, usable with 40+ consultants: a
searchable multi-select, not a checkbox list. That control needs an option list — every
consultant's id and display name — independent of the CRA rows themselves, because a filter's own
menu cannot be limited to "whoever already has a row on the page in front of you" without the menu
changing shape depending on which filter is already applied.

Two ways to get that list existed. **Derive it from `GET /api/v1/cras`' own response** — the page
already carries `consultantId`/`consultantName` on every row (ADR-0071), so the picker's options
could, in principle, come from whatever the manager has already loaded. Rejected: `/api/v1/cras` is
paginated (`Pagination`'s `limit`/`offset`, default page size), and item 6 grows an office roster
past that page size in at least one office — at that point "who can I filter by" would depend on
which page (and, worse, which filter) happened to be loaded first, which is the exact incoherence a
filter's own option list exists to avoid. It would also make the picker's options shrink the moment
a filter narrows the list that feeds it, which is backwards.

**Add a new, dedicated route that reads the roster directly from `public.consultants`.** This is
what ADR-0071 already did for the same shape of problem (a manager needed a named, scoped read
`GET /api/v1/cras/:id` did not offer) — same precedent, same office-scoping requirement, a
different table.

## Decision

**`GET /api/v1/consultants`, `forRoles('manager')` only, returns `{ consultants: { id,
displayName }[] }` for the caller's own office** (`PgReferenceReader.consultantsOfOffice(officeId)`,
`actor.officeId` — never a query parameter naming an office, the same reasoning
`assertMayRead`'s scope checks give everywhere else in this codebase for "an office comes from the
actor, not from the request").

- **Manager only**, not `'consultant', 'manager', 'billing'` the way `/api/v1/cras` itself is.
  The one caller is `CraListFilters` in `cra-list-screen.tsx`, itself rendered only for
  `role === 'manager'` — a consultant persona has exactly one row (their own) to filter, and
  billing's `/factures` screen has no consultant column or "Ouvrir" action yet
  (`columnsFor`'s own comment), so granting the read to either role would be a capability nothing
  exercises. Widening it is a one-line `forRoles` change if that changes; adding it ahead of a real
  caller is the anticipatory permission BUILD-RULES rules out.
- **No pagination, no filter of its own — and this is a departure from BUILD-RULES**, which says
  pagination is hard-capped including through the API and that there is no "show all". Naming it
  rather than leaving it implied: the rule has two reasons, an unbounded read and an aggregate
  reachable through a list, and this route answers neither. A roster is bounded by an office's
  headcount, not by the CRA table's row count — twenty rows for the largest office even after
  item 6 — and the payload is `{ id, displayName }`, with no Tjm, Cjm or margin the cap could be
  protecting. The aggregate half of the rule therefore holds unchanged here; the bound half is
  carried by the domain (an office roster) instead of by a `LIMIT`. If a real office roster ever
  needed pagination, that is a reconsideration on its own (see below), not a reason to add unused
  query parameters today. ADR-0081, on this same round, relaxes the other half of the same rule
  for `GET /api/v1/cras` and names it the same way.
- **`consultantsOfOffice`** is a new, small method on the existing `PgReferenceReader` — one query
  against `public.consultants`, the same reader `/api/v1/pre-facturier` and the manager's own CRA
  list already use for `consultantNames()`. No new persistence class; this reuses the reader that
  already exists for the read of a name.

## Rejected option

**Derive the filter's option list from `/api/v1/cras`' own paginated response**, described in
Context. Rejected on two grounds together: it does not scale past one page once item 6 grows a
roster (this mockup's own stated ceiling for the change that made this ADR necessary), and it
would tie the filter's own menu to whatever filter is already applied — a picker whose options
shrink when you use it.

## Reconsideration threshold

Reopen if an office roster in this dataset ever needs pagination of its own (a manager's own
office holding more consultants than fit one unpaginated response comfortably) — the day that
happens, `/api/v1/consultants` gets the same `Pagination` schema `/api/v1/cras` already has, not a
second route. Also reopen the role restriction the day billing's `/factures` screen grows a
consultant column or a manager-style "open this consultant's CRA" action: at that point
`forRoles('manager')` becomes `forRoles('manager', 'billing')`, a one-line change with no new
authorization logic (`packages/platform/src/scope.ts` already scopes `cra: 'office'` for billing
the same way it does for a manager).

## Consequences

**Easy.** One new route, one new reader method, both following an existing pattern
(`PgReferenceReader`, `forRoles`, office-scoped-from-the-actor) rather than inventing one. No
change to `/api/v1/cras` itself beyond the filter parameters ADR-0077 does not own (those are
item 7's own change to `CraListQuery`, not this ADR's decision).

**Expensive.** A second read of "who is in this office" now exists alongside
`consultantNames()`'s own per-name lookups (`pre-facturier`, `/api/v1/cras`'
`consultantName`) — three places read from `public.consultants` for overlapping but not identical
shapes (a name for an id you already have, versus a full roster to choose ids from). Left as
three, deliberately, rather than unified behind one shared query today: unifying them now would be
speculative generalisation ahead of a second real difference in what each caller needs.
