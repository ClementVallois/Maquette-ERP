# ADR-0007 — Gapless invoice numbering by row-level lock

- **Date**: 2026-08-18
- **Status**: accepted

## Context

Invoice numbering must be sequential and gapless per `(entity, fiscalYear)` — a legal requirement
for French invoicing (article 242 nonies A of CGI Annexe II). The `billing.numbering_series` table
already exists (migration 003) with a `last_sequence` column and a composite primary key
`(entity_id, fiscal_year)`. The domain is already shaped for this: `Invoice.issue()` takes a
`sequence: number`, and `documentNumber()` in `numbering.ts` formats it. The allocation that feeds
the sequence into the domain is infrastructure — it depends on a database lock.

Two decisions are recorded here: the locking mechanism, and where the allocator lives.

## Decision

### 1 — Allocation by row-level lock

A `PgNumberingCounter` allocates the next sequence number by:

1. `INSERT INTO billing.numbering_series … ON CONFLICT DO NOTHING` — ensures the row exists.
2. `SELECT last_sequence FROM billing.numbering_series WHERE … FOR UPDATE` — acquires the row lock
   and reads the current value.
3. `UPDATE … SET last_sequence = last_sequence + 1` — increments.
4. Returns `last_sequence + 1`.

Because the lock and the update are inside the caller's transaction, a rollback undoes the
increment — the next successful allocation gets the same number, not a gap.

### 2 — Standalone infrastructure, not a port

The three declared ports are `Clock`, `CraRepository`, and `InvoiceRepository`
(BUILD-RULES §"Port introduction"). A port is introduced at the second real implementation; the
counter has exactly one — the Postgres row lock — and no in-memory substitute that would prove
anything (an in-memory counter is gapless by construction, which makes the test a tautology). The
counter is composed at the edge: in the integration test in this phase, in `apps/api` in Phase 5.

## Rejected option

**Postgres `SEQUENCE`** (`nextval`/`setval`). `nextval` is not transactional: it increments
immediately, and a rollback does not undo it. Two concurrent transactions that both call `nextval`,
one of which rolls back, leave a gap in the series — the property the series exists to prevent.
Postgres documents this: "sequence manipulations are never rolled back."

## Reconsideration threshold

The row lock serialises all issuances for the same `(entity, fiscalYear)`. When throughput exceeds
what a single row lock sustains — hundreds of issuances per second, per entity, per fiscal year —
the counter needs partitioning: block allocation, or a dedicated counter service. A consulting firm
issuing ~300 invoices per month is nowhere near this.

## Consequences

- Gapless: a rolled-back allocation leaves no hole.
- No new port, no new abstraction — the domain stays unchanged.
- The counter must run inside the issuing transaction; using it from a separate connection or
  outside a transaction defeats the guarantee.
- Concurrent issuances for the same series are serialised by the row lock; for distinct series they
  run in parallel.
