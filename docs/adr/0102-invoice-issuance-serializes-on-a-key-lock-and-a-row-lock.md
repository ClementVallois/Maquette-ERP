# ADR-0102 — Invoice issuance serializes on a key lock and a row lock

- **Date**: 2026-09-07
- **Status**: accepted

## Context

ADR-0044 decided the three-way contract for `Idempotency-Key` (same key/same invoice replays,
different key/issued invoice conflicts, absent key is refused) and ADR-0007 decided the row-locked
counter that makes numbering gapless. Neither decided how the invoice itself is read before
`Invoice.issue()` runs — and `findById` had no lock at all.

Two requests issuing the same invoice both read it as `draft` before either commits. Both pass
`Invoice.issue()`'s transition check, both allocate a number from the ADR-0007 counter (correctly
consecutive — the counter was locked), and both call `save`, which unconditionally upserts. The
second commit overwrites the first: a probe reproduced this exactly, producing `SEC-2026-000001`
and `SEC-2026-000002`, with the database keeping only the second number and the counter advanced
twice for one invoice. Immutability of an issued document was never enforced against this race; it
only held against a second call from the _same_ already-committed row.

A second, distinct hazard sits next to it: `issuance_idempotency_key` is globally unique
(migration 009), but nothing serialized the check for an existing key against the insert that
claims it. Two different invoices issued concurrently under the same key could both pass a
`SELECT … WHERE issuance_idempotency_key = $1` that finds nothing, and the loser would then hit the
unique index as a raw `23505` from Postgres — an unhandled technical error, not the typed
`keyReused` response ADR-0044 promises.

## Decision

`prepareIssuance` now does two things before either the transition check or the number allocation
runs, in this order, inside the issuing transaction:

1. `SELECT pg_advisory_xact_lock(hashtext('billing.invoice.issuance'), hashtext($1))` on the
   `Idempotency-Key`. This serializes every concurrent issuance attempt that carries the _same_
   key, whichever invoice it names, so the key-uniqueness check-then-insert cannot race. The lock
   is released automatically at commit or rollback (`_xact_lock`, not a session lock a caller must
   remember to release).
2. `SELECT * FROM billing.invoices WHERE id = $1 FOR UPDATE` on the target invoice. This serializes
   every concurrent issuance attempt on the _same invoice_, whichever key it carries, so a second
   transaction cannot read a `draft` row the first is about to issue: it blocks until the first
   commits or rolls back, then reads the invoice's true post-commit state.

Together the two locks cover both axes of the race: same key/different invoices is caught by (1)
before either reaches the unique index, and different keys/same invoice is caught by (2) before
either reaches `Invoice.issue()`. `apps/api/src/chain/issue-invoice.ts` reads the locked state and
returns one of `issued`, `replayed`, `keyReused`, or `notFound`; a losing concurrent transaction
that finds the row already `issued` calls `Invoice.issue()` against that true state and gets the
existing `InvoiceTransitionError` → `409 /problems/invoice-transition-not-allowed` — no new error
type was needed.

## Rejected option

**An optimistic `version` column**, incremented on every write and checked with
`UPDATE billing.invoices SET …, version = version + 1 WHERE id = $1 AND version = $2`, mapping zero
rows affected to a typed conflict.

It loses on two grounds specific to this route, not in general:

- It only guards the _row_. The same-key/different-invoices hazard is not a conflict on one row's
  version at all — it is a race on a global unique index across two unrelated rows — so a version
  column would still need the advisory lock (or an equivalent) beside it. Adopting it would not
  remove a mechanism, only add a second one next to the one this decision already needs.
- It detects the conflict **after** the work: both transactions would still allocate a number from
  the ADR-0007 counter and run `Invoice.issue()`'s business checks before either discovers, at the
  final `UPDATE`, that it lost. The loser's counter allocation is wasted but not lost (the
  transaction rolls back and ADR-0007 keeps the series gapless), yet the visible cost — a second
  full domain evaluation for a request that was always going to be refused — buys nothing here: the
  row lock makes the loser observe the true state _before_ it evaluates anything, and answers with
  the state machine's own error rather than a new "stale version" one.

## Reconsideration threshold

The advisory lock's key is `hashtext(idempotencyKey)`: two unrelated keys that hash to the same
64-bit value would serialize against each other needlessly. This is a correctness no-op (it only
costs latency, never a wrong answer) and, at the firm's real volume — one issuance transaction
holding the lock for the duration of one number allocation and one upsert, on the order of a few
hundred invoices a month (ADR-0007's own figure) — collision-driven queuing is not observable.
Reopen if issuance throughput or concurrent-writer count grows enough to make hash-collision
queuing measurable, or if a second POST route needs to allocate from the same numbering series
(ADR-0044's own threshold) and so needs to join this locking scheme.

## Consequences

- Every issuance now costs one extra round trip (the advisory lock) and a locked read instead of a
  plain one. Negligible next to the counter's own row lock, which already serializes same-series
  issuances.
- A genuine concurrent retry (two requests, same key, same invoice, near-simultaneously) now
  blocks rather than racing: the second request waits for the first's commit and returns the
  identical replayed document, never a second number.
- A genuine concurrent double-issuance (two requests, same key, two different invoices) can no
  longer surface Postgres's raw `23505` unique-violation as an unhandled `500`; it is observed as
  the typed `keyReused` conflict on the loser.
- The lock order (key, then row) is fixed and must stay that way everywhere a future caller might
  take both: taking them in the opposite order anywhere would open a deadlock this ADR's ordering
  currently forecloses.
