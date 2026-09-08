# ADR-0103 — Cra writes serialize on a row lock and an advisory lock

- **Date**: 2026-09-07
- **Status**: accepted

## Context

`recordMonth`, `validateCraAndDraftInvoices` and `refuseCra` each read a `Cra` with a plain
`SELECT`, mutate the in-memory aggregate, and `save` it with an unconditional upsert. Two
concurrent requests on the same `Cra` both read the same pre-write state, both pass the domain's
own transition checks against that stale state, and both write — the second commit silently
overwrites the first.

Reproduced: a manager's `validate` and a manager's `refuse` on the same submitted `Cra`, started
close enough together that both read `status: 'submitted'` before either commits. Whichever
commits second overwrites the first — including, when `validate` committed first, a stale
`refuse` writing `status: 'refused'` back onto a `Cra` whose invoices are already drafted and
committed in `billing`. The `Cra`'s own status and the invoices it produced then disagree, and
nothing about the row says so.

A second, distinct hazard: `recordMonth` opens a new `Cra` (`Cra.open`, a fresh id) when
`findByConsultantAndPeriod` finds none. Two concurrent first saves for the same
`(consultantId, period)` both find none and both attempt to create one. `timesheet.cras` carries
`UNIQUE (consultant_id, period)` (migration 002), so the second `INSERT` — for a _different_ id,
since each caller minted its own — raises a raw `23505`, unhandled, on a request that was legitimate
on its own.

Both hazards are the same shape ADR-0102 closed for invoice issuance seven commits earlier: a
read with no lock, followed by a write that assumes nothing changed underneath it.

## Decision

Two new repository methods, used only by the three write chains — `findById` and
`findByConsultantAndPeriod` keep serving every screen unlocked, exactly as before:

- **`findByIdForWrite`**: `SELECT … FOR UPDATE` by id. Used by `validateCraAndDraftInvoices` and
  `refuseCra`. A concurrent write on the same `Cra` blocks until the first transaction commits or
  rolls back, then reads the row's true post-commit state — never a copy of the state both
  callers started from.
- **`findByConsultantAndPeriodForWrite`**: `pg_advisory_xact_lock` on
  `hashtext('timesheet.cra.write')` and `hashtext('<consultantId>:<periodIso>')`, **then**
  `SELECT … FOR UPDATE` by `(consultant_id, period)`. Used by `recordMonth`. The advisory lock is
  what protects the row that does not exist yet — a row lock has nothing to take until an `INSERT`
  commits — so a second concurrent first save waits, then finds the first save's row and edits it,
  never opening a duplicate. Once the row exists, both the advisory lock (for another `recordMonth`
  on the same tuple) and the row lock (for a manager's `findByIdForWrite` on the same row) apply,
  and either serializes against the other since they contend on the same physical row.

`save`'s `INSERT` additionally catches `cras_consultant_id_period_key` and raises a typed
`CraAlreadyExistsError` (`409 /problems/cra-already-exists`) — the second boundary, unreachable
through the locked path in ordinary operation, the same idiom `saveDraft`'s
`CraAlreadyProcessedError` already uses in `billing` for the equivalent race on
`idx_invoices_source_cra_client`.

The locking scheme depends on **READ COMMITTED** (Postgres's default, what `pgTransactionally`'s
plain `BEGIN` gives): a blocked transaction, once unblocked, re-reads under a fresh statement-level
snapshot rather than raising a serialization failure. That is why the second caller sees the
winner's committed row rather than needing a retry loop.

This is a **separate** locking scheme from ADR-0102's, not a variant of it: distinct advisory-lock
namespaces (`'timesheet.cra.write'` vs. issuance's key hash), distinct rows, and no code path
takes both locks in one transaction — drafting a `Cra` allocates no invoice number, and issuing an
invoice never re-locks the `Cra` that produced it. ADR-0102's lock-ordering caution (key, then row,
and never the other way) does not apply across the two schemes because they never overlap.

## What a lock alone does not fix

Two concurrent `recordMonth` calls on an _already-existing_ draft `Cra` (two browser tabs editing
the same month, neither submitting) both still succeed, sequentially: the second, once it acquires
the lock, reads the first's committed lines, then **replaces** them with its own `command.entries`
— `recordMonth`'s own documented semantics ("Replace rather than merge. The form posts the whole
month"). The lock removes the corruption a race could cause here (reproduced separately: without
it, two overlapping saves' lines can merge into one row, since neither transaction's `DELETE FROM
cra_lines` sees the other's uncommitted `INSERT`s, and both then commit); it does not turn this PUT
into a check against what the second saver last _saw_. A caller with a stale browser snapshot loses
their edit silently, in the same way any last-write-wins `PUT` does.

## Rejected option

**An optimistic `version` column** on `timesheet.cras`, checked and incremented on every `save`.

It would close the status-transition hazard (the headline defect: a stale refusal outliving a
committed validation) exactly as the lock does, but by a different route — detecting the conflict
at `UPDATE` time instead of preventing the stale read in the first place. Rejected for two reasons
specific to this aggregate:

- It does **not** close the creation race. Two concurrent first saves for a `(consultantId,
period)` with no row yet have no version to compare — the collision is on the unique index, not
  on a row either side has read. A version column would still need the advisory lock (or an
  equivalent) beside it for that half of the problem, so adopting it replaces nothing; it adds a
  second mechanism next to the one this decision already needs.
- It answers with a _new_ conflict shape (`expected version N, found M`) for a hazard the domain
  already refuses correctly once it sees the truth: `Cra.validate()` and `Cra.refuse()` already
  throw `CraTransitionError`/`ValidatedCraIsImmutableError` for "wrong status". The lock makes the
  loser _see_ the true status before it decides; a version check would make the loser fail for a
  reason (`stale version`) that is not the reason the business actually cares about, and duplicate
  a check the aggregate already performs correctly.

**Adding an `expectedRevision` to `recordMonth`'s wire contract**, so a genuinely stale draft edit
gets a typed conflict instead of last-write-wins, was considered and set aside rather than rejected
outright — see below.

## Reconsideration threshold

**Draft/draft staleness detection** (the gap named above) is reopened when package 11
("Complete mutation invalidation and protect unsaved CRA drafts") defines what the client does with
a conflict: an `expectedRevision`/`If-Match`-shaped field on `recordMonth`'s command, refused with a
typed `409` when the server's current state has moved past what the caller last read. Until that
client-side story exists, adding the field here would be a guard nothing reads the refusal of.

The advisory-lock hash (`hashtext('<consultantId>:<periodIso>')`) can collide between two unrelated
`(consultantId, period)` pairs, serializing requests that share nothing. Harmless — it costs
latency, never a wrong answer — at this firm's volume (one `Cra` per consultant per month); reopen
if concurrent-writer volume makes hash-collision queuing measurable.

## Consequences

- Every `validate`/`refuse`/`recordMonth` now reads with a lock instead of a plain `SELECT`; every
  screen read (`findById`, `findByConsultantAndPeriod`, `list`, …) is unaffected — a list of 50
  Cras still takes zero row locks.
- A stale `refuse` after a committed `validate` (or the reverse) now gets the domain's own existing
  typed conflict, not a silent overwrite — no new error type was needed for that half.
- A first-save race for a brand-new month is resolved as "the second request edits what the first
  created", never a duplicate row and never a raw constraint violation reaching the caller.
- Concurrent drafts of an _already-open_ month no longer merge into one corrupted row; the last
  commit fully replaces the first, which is the documented behaviour, not a new guarantee.
- What remains open by design: a caller saving over their own stale in-memory snapshot of a draft
  loses that edit silently. Named above, deferred to package 11.
