# ADR-0031 — Reference data: per-module projections, the seed as single writer

- **Date**: 2026-08-18
- **Status**: accepted

## Context

The chain reads reference data at every step. `timesheet` has to know when a mission runs and who
is staffed on it, or it cannot refuse a day on a mission that ended in February. `billing` has to
know the client, its territoriality and the mission's dated `Tjm`, or it cannot draft a line. Both
sets describe the same three objects — a consultant, a mission, a client — and no earlier decision
says where any of it lives.

The constraint that makes this structural rather than a matter of taste: `billing` may import
**nothing** from `timesheet`, and dependency-cruiser enforces it. So "the mission lives in
`timesheet` and `billing` reads it" is not an option that exists. Left undecided, this gets
improvised in the middle of a task, which is how a shared `common` module appears in a repository
whose entire thesis is that its modules are sealed.

## Decision

**Each module stores the projection its own rules read.**

- `timesheet` holds consultants, assignments and mission **staffing dates** — when a mission runs,
  who is on it, between which dates. Nothing about money.
- `billing` holds clients and the mission's **commercial terms** — the dated `Tjm`, territoriality,
  payment terms. Nothing about who worked.

They are keyed by **shared UUIDs**, and the **deterministic seed is the single writer of both
sides**. That is what makes the duplication safe rather than a divergence waiting to happen: there
is exactly one process that writes a mission, and it writes both projections from the same row of
its own source data.

The two projections carry the same names — `Mission` on both sides — and are different types. That
is the intended reading: a mission _as staffing_ and a mission _as a commercial object_ are not the
same object, and the enforced boundary is what stops one from being quietly used as the other.

The **shape** of what both modules speak (dates, periods, half-days, the `Tjm` type) lives in the
shared kernel by ADR-0033; the **data** never does. The kernel holds no row.

In this phase the decision shapes the domain model — what `timesheet` may know about a mission.
Phase 3 gives each projection its tables, in per-module schemas. Phase 4 writes the rows.

## Rejected option

**A third module — `reference` — owning consultants, missions and clients, imported by both.** The
standard answer, and it is not wrong in general: one row, one owner, no duplication. It loses here
on the property this repository is built to demonstrate. Both modules would import it, so the
module graph becomes a hub rather than two sealed boxes with one arrow between them, and the
`reference` module inevitably accumulates the fields both callers need — the `Tjm` next to the
staffing dates. At that point breaking the boundary requires no import at all: it is enough to add
a column. The demo of a boundary that CI enforces would be running around a module that makes it
irrelevant.

**One shared database schema read by both modules.** Cheaper still, and it is what an ERP normally
does. Rejected for the same reason one level down: the boundary would hold in TypeScript and leak
in SQL, and Phase 3's per-module schemas exist precisely so that a join across the boundary is a
permission error rather than a code review comment.

**Runtime synchronisation between the two projections** — an event when a mission changes,
consumed by the other side. The correct answer when both sides have runtime writers. It loses on
YAGNI today: there is exactly one writer, the seed, and building a synchronisation mechanism for a
system with no second writer is inventing the problem in order to solve it.

## Reconsideration threshold

Reopen at the **first runtime writer of reference data** — an admin screen that creates a mission,
or an import from the CRM. At that moment the seed stops being the single writer, the two
projections can genuinely diverge, and synchronisation becomes a real requirement rather than an
anticipated one. The rejected option above is then the one to build.

Also reopen at a **third consumer module**. Two projections written by one process is a decision;
four is a fan-out, and the shared owner starts paying for itself.

## Consequences

Neither module imports the other to answer a question about a mission, so the arrow count between
them stays at zero and the cruiser keeps meaning something.

Each module's model says exactly what that module is allowed to reason about, which is visible in
the type: `timesheet`'s `Mission` has no `Tjm` field, so no rule of `timesheet` can accidentally
depend on a rate. That is the reason a reader will be given at the demo for why the boundary is not
decorative.

The cost is duplication and the discipline it demands: the same mission exists twice, and the seed
has to write both. It is named as a cost rather than defended as free — and the threshold above is
the point at which the cost overtakes the benefit.

A submission check is therefore a pure function of the Cra and a **reference snapshot** handed to
it, not a domain object calling out to a repository. The domain performs no I/O, and the snapshot
is what keeps that true while still letting a rule read staffing.
