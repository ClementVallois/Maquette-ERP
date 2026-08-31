# ADR-0081 — `GET /api/v1/cras` gets its own, higher, still-fixed page cap

- **Date**: 2026-08-31
- **Status**: accepted

## Context

`apps/api/src/routes/api.ts`'s `Pagination` schema caps every list route's `limit` at
`MAX_PAGE_SIZE = 50`, doubled by the same constant inside each repository's own `list()`
(`Math.min(query.limit, MAX_PAGE_SIZE)`) — belt and braces, named in BUILD-RULES ("Pagination is
hard-capped, including through the API. There is no 'show all'"). `apps/web/src/features/cra/api.ts`'s
`fetchCraList` already asks for exactly that cap, 50, with no pagination control anywhere in the UI
to go further — a manager's filtered CRA list (item 7, QA round 1) is whatever one page holds, full
stop.

Item 6 (QA round 1) made this a live defect rather than a theoretical one: the roster expansion
(ADR-0080) measured Paris at 65 Cras and Lyon at 62, once the dense 2026 months and the sparse 2016
history both exist. A manager filtering that office's CRA list — item 7's whole point — would see
a page silently short of the office's real count, answering _wrong_, not merely _thin_: a row the
filter would have matched can sit past the cap and never appear, with nothing on screen saying so.

## Decision

**`GET /api/v1/cras` gets its own cap, `CRA_LIST_MAX_PAGE_SIZE = 200`, overriding `limit` on top of
the shared `Pagination` schema rather than raising `MAX_PAGE_SIZE` itself.** Three call sites move
together, all citing this ADR:

- `apps/api/src/routes/api.ts`'s `CraListParams` redefines `limit` at the new cap (Zod's
  `.extend()` on an object schema replaces the named field, not appends a second check).
- `packages/timesheet/src/infrastructure/pg-cra-repository.ts`'s own `MAX_PAGE_SIZE` — the
  repository-side belt to the route's braces — moves to 200 too. Raising only the route and
  leaving the repository at 50 would have shipped a route that _looks_ fixed and a `Math.min`
  that quietly narrows it straight back.
- `apps/web/src/features/cra/api.ts`'s `DEFAULT_LIST_LIMIT` moves to 200, so the one request this
  screen ever makes actually asks for the office's realistic worst case rather than the old
  default.

200 is sized with headroom over the measured worst case (65), not merely equal to it — the seed's
own roster is not the ceiling on how large a real office's roster could grow, and a cap set exactly
at today's number is a cap this ADR would have to be rewritten the next time the seed grows by one
consultant. It stays a **fixed number**, never `Infinity` or a caller-chosen ceiling: a request for
more than 200 is still refused by `CraListParams`'s own `.max()`, the same shape `MAX_PAGE_SIZE`
already gives every other list.

`MAX_PAGE_SIZE` itself, and every other route built on `Pagination` as written — `/api/v1/invoices`
first among them — is **untouched**. `/api/v1/invoices` has no `period` filter and is read in full
by `/factures`; item 6's own invoice volume was kept deliberately under fifty per office
specifically so this ADR would not have to widen that cap too on the same commit (ADR-0080's own
consequence section).

## Rejected option

**Raise `MAX_PAGE_SIZE` itself, globally.** Rejected: `/api/v1/invoices` shares the same constant,
and its own worst case was never measured — moving the number that governs both routes on the
strength of a CRA-specific measurement would be a claim this ADR cannot make about invoices.

**Have the manager's request ask for the office's exact count**, fetched via a preliminary
`COUNT(*)` read. Rejected for now: it adds a second round trip and a second endpoint (or a second
shape of the same one) for a UI that has exactly one caller and no pagination control to speak of —
the fixed, generous cap already answers "every row, unfiltered" for every office this dataset (or
a realistic multiple of it) can produce. The reconsideration threshold below is what would flip
this choice.

## Reconsideration threshold

**The day a single office's CRA count is measured past 200** (roster growth, or years of
additional history), or **the day this screen gains a pagination control of its own** — either
makes a fixed cap the wrong shape again, and the exact-count design rejected above becomes the
one to build instead of raising the number a third time.

## Consequences

**Easy.** Three constants moved, one schema field redefined, no migration, no new route. The
existing "cap is here and in the repository" belt-and-braces shape is preserved exactly, just at a
different number for this one route.

**A future office past 200 Cras reintroduces the exact defect this ADR closes**, silently, unless
someone remembers to check. `docs/todo.md`/`docs/open-questions.md` name the threshold above so
the next person sizing the seed further has somewhere to look before they hit it blind.
