# ADR-0019 — TDD extended beyond the domain: integration tests against a real Postgres

- **Date**: 2026-08-18
- **Status**: accepted

## Context

Phases 1 and 2 built the domain as pure TypeScript with full test coverage. Phase 3 adds
persistence — migrations, repositories, transactions — and the question is whether the same
discipline holds there.

Testing infrastructure after the fact, against a fixture built to exercise it, validates the
shapes you predicted. Testing it first validates the shapes the domain needs.

The cost is real: every `test:int` run requires a Postgres container, making the integration
suite too slow and too heavy for `pre-push`. The unit suite stays in `pre-push`; the
integration suite runs in CI only, where a Postgres service container is always available.

## Decision

Integration tests are written **before the SQL they test**, against a real Postgres, with
per-test transaction rollback.

Each test opens a transaction at the start, the repository under test uses that transaction,
and the test rolls it back at the end. The database schema is real (applied by the migration
runner), the data is written by each test, and tests are isolated from each other without
`TRUNCATE` or per-test databases.

No Testcontainers: the container runs as a plain `docker compose up` locally, and as a
`services:` block in CI. Testcontainers adds a dependency, a JVM or Docker-in-Docker in CI,
and a startup penalty per suite — costs this build does not need, since there is exactly one
container to manage and `compose.yml` already describes it.

**Coverage**: integration tests are deliberately excluded from the coverage threshold.
Domain coverage (the threshold at 90 %) measures whether business rules are tested; adding
infrastructure tests to the same metric lets a well-tested repository inflate coverage for
a poorly-tested invariant. The integration tests have their own contract: every repository
method has at least one positive and one negative test, and every authorization scope rule
has a test that asserts the refusal.

## Rejected option

**Testing infrastructure after the fact, against a fixture built to exercise it.** The fixture
validates shapes the code already contains — round-tripping a known object — and misses shapes
the domain needs but the SQL omitted (a missing column, a wrong type, a join that silently drops
a row). Testing first finds those in the red phase, where they are a failing test rather than
a debugging session.

## Reconsideration threshold

~12 integration tests per module, or the first test whose setup exceeds its assertion in
complexity. At that point a shared fixture or a test-database-per-suite model is cheaper than
per-test rollback.

## Consequences

**Easy**: every migration is tested by the time it merges; the rollback keeps tests
independent without cleanup; no new dependency or tool is introduced.

**Expensive**: `test:int` requires Docker, so it cannot run in `pre-push` without adding
several seconds of startup; CI gains a Postgres service container and a job that did not exist.
Coverage on the infrastructure layer is unmeasured — a missing test is caught by the contract
(every method, every refusal), not by a number.
