# ADR-0065 — Composition-root reads get a directory, and economics stays where it is

- **Date**: 2026-08-25
- **Status**: accepted

## Context

ADR-0043 put the margin read at the composition root — in neither module — because margin belongs
to neither `timesheet` nor `billing`. It wrote its own reconsideration threshold in the same breath:
"Reopen if a second read model appears at the composition root. One is a read model; three are a
layer, and a layer needs a home and a name rather than a directory that grew."

`docs/frontend-plan.md` Phase 5 reaches that threshold directly. Two of its three endpoints —
`GET /api/v1/pre-facturier` (5.1) and `GET /api/v1/cras/:period/grid` (5.2) — are explicitly a
**second read** of an existing screen's composition, not a new one: the plan's own rule for the
phase is "the compositions exist already in `apps/api/src/web/pages/*.ts` — the endpoints reuse
them, they do not reinvent them." Both compositions were, until this phase, inlined inside
`apps/api/src/web/routes.ts`'s handlers — reusable in principle, reachable by nobody else in
practice. Copying ~90 and ~30 lines respectively into `routes/api.ts` would satisfy the letter of
"reuse" while producing the exact duplication ADR-0043 named as the failure mode a second read model
represents.

The third endpoint, `GET /api/v1/dashboard` (5.3), has **one** consumer today: this route. No
screen composes a dashboard yet — `docs/BUILD-PLAN.md`'s equivalent, front-end plan Phase 8.4, is
three phases away and unbuilt. `BUILD-RULES.md` § Boundary and layering already states the
precedent this generalises: "A port is introduced only at the second real implementation, never in
anticipation of one." A read model is not a port, but the reasoning is the same reasoning: an
abstraction built for a caller that does not exist yet is a guess about that caller's shape, and the
guess is usually wrong by the time the caller is real.

## Decision

**Shared reads — reads with two or more real consumers — live in `apps/api/src/composition/`, one
file per screen's subject.** This phase adds two: `composition/pre-facturier.ts`
(`preFacturierComposition`, consumed by the pré-facturier screen and by 5.1) and
`composition/cra-grid.ts` (`craGridComposition`, consumed by the Cra grid screen and by 5.2). Each
keeps the types its screen already exported public (`CraRow`, `BillableRow`, `Blocking` move with
the pré-facturier's composition; the grid's screen-only types — `GridDay`, `SlotValue`, the two-slot
rendering — stay in `web/pages/cra-grid.ts`, because they are a fact about the HTML form and the API
route does not want them, per 5.2's own text: it exposes the underlying month and lines, not the
two-box rendering).

**`GET /api/v1/dashboard` is not extracted.** It has one caller. Its aggregation — per-role sums
over `unit.cras.list` and `unit.invoices.list`, already scoped by office through `assertMayRead` —
is written directly in `routes/api.ts`, inline in the handler that is its only caller: three role
branches, each a few lines over reads this file already makes. The day a dashboard screen exists
(front-end plan Phase 8.4) and needs the same aggregation, that is the second real implementation,
and the branches move into `composition/dashboard.ts` in the same commit that adds the second
caller — not before.

**`apps/api/src/economics/consultant-economics.ts` does not move.** It already has two real callers
(the `/marge` screen and `/api/v1/consultants/:id/economics`) and already satisfies everything this
ADR asks for a shared read to satisfy — it is not renamed into `composition/` today. Two directories
holding the same kind of thing is the cost this ADR accepts rather than the inconsistency it
resolves: `economics/` is named for what it reads (a domain concept, and ADR-0043's own title calls
it that), while `composition/` is named for what its members are (an architectural role, applying to
whichever reads warrant one from Phase 5 on). Renaming `consultant-economics.ts` now would touch
every file that imports it and every comment that cites ADR-0043 by path, for no behavioural change
— churn this ADR does not ask for. The two names are reconciled the next time
`consultant-economics.ts` is touched for an unrelated reason, not as a lone rename commit.

## Rejected option

**Copy each composition into `routes/api.ts`, once per endpoint.** The plan's own instruction
forbids this in words ("reuse them, they do not reinvent them"), and it is what ADR-0043's
threshold was written to catch before it happened a second time: two copies of the pré-facturier's
declined-days/late-days arithmetic, one in the screen's handler and one in the API route, kept in
step by nobody.

**Extract the dashboard's aggregation into `composition/` now, on the theory that Phase 8.4 will
want it.** Rejected on the same YAGNI BUILD-RULES claims for a port: the shape a future screen wants
is a guess until that screen is written, and a read model built for an imagined caller is exactly
what ADR-0031's history (twice, per BUILD-RULES' own account of the domain-guard gaps) shows this
repository paying for later.

**Rename `economics/consultant-economics.ts` into `composition/economics.ts` in this same phase, for
consistency.** Tempting, and rejected on cost rather than principle: it is a pure rename with no
behavioural change, touching `routes/api.ts`, `web/routes.ts`, this file's own tests, and every
comment across the repository that cites `apps/api/src/economics/consultant-economics.ts` by path —
for a directory-naming preference, in a phase whose commit scope is `api` reads, not a refactor of
Phase 5's own predecessor.

## Reconsideration threshold

Reopen "one file per screen's subject" if a third genuinely shared read appears that composes the
same two module reads as an existing one — at that point the shared **query shape**, not just the
directory, is the duplication, and the fix is a shared helper inside `composition/`, not a third
sibling file repeating the same two calls.

Reopen the `economics/` vs `composition/` split the next time either file is touched for a reason
unrelated to this ADR: fold `consultant-economics.ts` into `composition/` in that commit, so the
inconsistency does not outlive the next legitimate reason to be in the file.

## Consequences

**Easy.** `web/routes.ts`'s two extracted handlers are now three lines each — a `transactionally`
call handing a `UnitOfWork` to the composition, and the render call — and `routes/api.ts` calls the
exact same function for 5.1 and 5.2, so the screen and the endpoint cannot answer a different number
for the same question. A reader who wants "everything the pré-facturier assembles" finds it in one
file, not split between a route registered under `/pre-facturier` and one registered under
`/api/v1/pre-facturier`.

**Expensive.** Two directories now hold the same kind of code (`economics/`, `composition/`), and
the second paragraph of the Decision above is the whole of what justifies not fixing that today.
