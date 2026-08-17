# ADR-0011 — Hand-written SQL over `pg`, and no ORM

- **Date**: 2026-08-17
- **Status**: accepted

## Context

Two of this mockup's invariants are database behaviour, not application logic:

- gapless invoice numbering needs a row locked with `SELECT … FOR UPDATE` inside the issuing
  transaction (a Postgres `SEQUENCE` will not do — `nextval` is not transactional, so a rollback
  leaves a hole);
- the module boundary is visible down to the database, one schema per module (ADR-0001).

And `CLAUDE.md` rule 3 says the domain is plain TypeScript with no ORM in it, testable without a
database at all.

## Decision

**`pg` as the driver, SQL written by hand in the infrastructure layer, migrations as numbered `.sql`
files** applied by a small script. Repositories map rows to domain objects explicitly.

The domain never sees a row, a driver type, or a connection.

## Rejected option

**Drizzle.** The strongest candidate: typed SQL, readable migrations, no hidden engine. It loses on
margin rather than on principle — for the amount of SQL this mockup contains (one schema per module, a
handful of tables, two locking queries), the generated migrations and the query-builder syntax add a
layer to read without removing one to write. Its type inference is the thing genuinely given up here.

**Prisma.** Comfortable and fast to start. It loses because the features that decide this schema —
`FOR UPDATE`, per-module schemas, exclusion constraints if they ever arrive — are the ones it reaches
last or reaches through an escape hatch, and because its generated client is a type surface with a
strong pull toward being passed around, including into places that should not know it exists.

**Kysely.** A pure query builder with no migration opinion, so the closest thing to this decision with
types attached. Rejected only on dependency count for the value returned at this size; it is the first
thing to try if the SQL grows.

**TypeORM** was not considered: its entity decorators are the ORM-in-the-domain pattern that rule 3
exists to forbid.

## Consequences

The cost is real: no compile-time check that a query's columns match the type it is mapped into. The
mitigation is that mapping happens in exactly one place per aggregate, and that infrastructure is
tested against a real Postgres rather than a fake — an in-memory double would test neither
`FOR UPDATE` nor transactional behaviour, which are the invariants.

The benefit beyond the invariants: a reader who opens a migration sees the schema, and a reader who
opens a repository sees the query. Nothing about the persistence of this domain requires knowing a
library.

## Reconsideration threshold

Reopen when the hand-written SQL passes roughly a dozen queries per module, or on the first bug caused
by a column/type mismatch that a typed builder would have caught at compile time. Kysely first,
because it changes the queries without touching the migrations or the domain.
