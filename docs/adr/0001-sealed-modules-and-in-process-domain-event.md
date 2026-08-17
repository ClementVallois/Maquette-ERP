# ADR-0001 — Two sealed modules, one arrow, verified mechanically

- **Date**: 2026-08-17
- **Status**: accepted

## Context

The mockup exists to show that a module boundary can be real rather than a naming convention. Two
modules: `timesheet` records and validates a Cra, `billing` drafts an invoice from it. The chain is
one-directional — validating a Cra must produce a draft invoice — so something has to cross.

The demo plan includes breaking that boundary live and showing CI go red, which makes the
enforcement mechanism a deliverable in its own right, not tooling.

## Decision

`timesheet` publishes a `timesheet.TimesheetValidated` domain event on an in-process bus and does
not know who listens. `billing` subscribes. The **event contract lives in `@erp/platform`**, the
shared kernel, so the number of imports from `billing` into `timesheet` is zero rather than one.

`dependency-cruiser` enforces every arrow, with `default: disallow` — a module added tomorrow is
forbidden until someone declares its right. It runs as its own CI job, `Module boundary`.

## Rejected option

**A direct call from `timesheet` into `billing`.** It is shorter and it works. It loses because it
is the exact failure the mockup is about: `validateTimesheet()` ends up calling billing, then
staffing, then notifications, and the caller grows a dependency on every future consumer. The event
also makes the emitter testable by asserting "this event was published with this payload", with no
mock of the consumer.

**Putting the event contract in `timesheet`.** The obvious home, and the one most repositories pick.
It loses because `billing` would then legitimately import from `timesheet`, and the rule would have
to permit one arrow. A permitted arrow is a hole that grows; zero arrows is checkable.

**`eslint-plugin-boundaries`** (used in a sibling project of the author's, so the config was
available to copy). It expresses the same rules well. It loses on one point that matters here: a
violation surfaces inside a lint run among unrelated errors, whereas the demo needs a CI job whose
name is the business boundary. Fewer dependencies is a secondary benefit.

## Reconsideration threshold

The in-process bus stops being enough the day a consumer runs **outside this process**. At that
point the event must leave the transaction through a transactional outbox with a publisher, and a
real broker sits behind it. The producers do not change — that is the property being bought here.

The `dependency-cruiser` choice reopens if the front-end is built inside a framework that resolves
imports its own way and the cruiser can no longer see them.

## Consequences

Adding a consumer costs nothing in `timesheet`: a new module subscribes to an existing event without
the emitter being touched. That is what makes the modular monolith extensible in practice rather
than in theory.

The cost is indirection: reading "what happens when a Cra is validated" requires knowing the event
name, not following a call. The `domain_events` journal is the answer to that, and it is not built
here.

A guard is only worth what it actually checks. Three failures were found while wiring this up, all
of the same family: cruising directories collected zero files and reported success; pnpm's workspace
symlinks attributed one package's files to another; and the cruiser exits zero when its globs match
nothing. Hence two safeguards that are part of the decision — `scripts/boundaries.ts` fails on a
zero cruise count, and a fixture holding a deliberate violation is asserted to be **rejected**, so a
green run distinguishes "the code is clean" from "the rule is dead".
