# ADR-0022 — The deterministic seed is a deliverable

- **Date**: 2026-08-19
- **Status**: accepted

## Context

The mockup carries a dataset: offices, practices, consultants, missions, clients, CRAs and the
invoices they produce. That dataset exists to be shown — in the README, in the demo, in every
screenshot an ADR cites. If `pnpm run db:reset` produces different UUIDs, every reference to a
record goes stale on the first reset, and every screenshot taken from one instance is wrong on
another.

The seed also validates the schema end to end: it inserts rows into every table the migrations
create, exercising foreign keys, check constraints and default privileges. A silent change to a
constraint that the seed does not hit is a constraint nobody is testing, and the coverage gap it
leaves is invisible until it bites in production data.

## Decision

**The seed is a deliverable, not a fixture.** It is checked into the repository, replayed in CI
(`pnpm run setup` from a clean checkout), and held to the same standards as the domain code: Zod
validates its boundary, its identifiers are deterministic, and its content is synthetic — no real
name, no real rate.

The seed drives the domain aggregates rather than writing rows directly: every seeded CRA passes
every submission check, and every invoice is drafted through `draftInvoicesFrom`. This proves the
dataset is reachable through the invariants, and it means a tightened invariant fails the seed
before it fails a user.

`submit()` and `validate()` take a `Clock`; the seed uses a fixed instant so that `submitted_at`
and `validated_at` are identical across runs.

## Rejected option

**Generating random data at each run** (a factory or a Faker-style library). The identifiers would
change, so no document — README, ADR, demo script — could name a record by its id, and "same seed,
same database" would be false. The mockup's documentation references specific records to make its
claims checkable; random data makes that claim decorative.

## Reconsideration threshold

A second dataset is needed — a load-testing scenario, a locale-specific edge case, a multi-tenant
isolation test. At that point the deterministic seed stays as the one the documentation references,
and the second dataset is a separate script with its own identifiers.

## Consequences

- `pnpm run db:reset` produces the same database on every machine, every time.
- Screenshots, ADRs and the demo script can cite record identifiers and stay correct.
- Every invariant the domain enforces is exercised by the seed, so a tightened rule surfaces at
  seed time rather than at demo time.
- The dataset is static: adding a scenario means editing the seed, not configuring a parameter.
  That is a cost only if the number of scenarios outgrows one file; the threshold above names when.
