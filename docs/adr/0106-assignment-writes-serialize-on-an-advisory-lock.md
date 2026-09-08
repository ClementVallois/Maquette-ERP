# ADR-0106 — Assignment writes serialize on an advisory lock

- **Date**: 2026-09-07
- **Status**: accepted

## Context

`validateAssignment` (`apps/api/src/staffing/assignment-admin.ts`), shared by `createAssignment`
and `updateAssignment`, checked overlap with a plain `SELECT EXISTS (...)` followed by a separate
`INSERT`/`UPDATE`, with no lock between the two. `public.assignments` carries no unique or
exclusion constraint either (migration 001: `id` primary key, two plain indexes, nothing else).
Two transactions creating overlapping assignments for the same `(consultantId, missionId)` could
both read "no overlap yet" before either commits, and both insert — two overlapping rows, the
invariant `validateAssignment` exists to hold, broken by a race the function's own logic cannot
see.

A second, distinct defect sat next to it in `updateAssignment`'s recorded-days check: it read
every `timesheet.cra_lines` row for the edited assignment's `(consultantId, missionId)` outside
the assignment's **own** new range, with no restriction to the specific assignment being edited.
Two disjoint assignments on the same mission (a January one and a July one) share that
`(consultantId, missionId)` pair, so a recorded day on the January assignment — untouched by an
edit to July — was read as if it were about to lose coverage, and a legitimate edit to July was
refused for a reason that had nothing to do with July.

A first attempt to prove the race with two real HTTP connections and `Promise.all`
(`app.inject()` over `pgTransactionally`, the same shape `cra-concurrency.int.test.ts` uses)
did not reproduce it in five consecutive runs: with no artificial delay, one request's short
chain of sequential awaited queries can outrun the other's before either reaches contention,
so the absence of a failure there is not proof of safety. The proof that actually demonstrates
the hazard, and that catches the fix, holds a first connection's transaction open past its own
write and shows a second, genuinely independent connection blocks on the _same_ check — the
technique `pg-cra-repository.int.test.ts`'s "lock proofs" (ADR-0103) already established.

## Decision

**The overlap race**: `validateAssignment` now opens with
`SELECT pg_advisory_xact_lock(hashtext('staffing.assignment.write'), hashtext($1 || ':' || $2))`
on `(consultantId, missionId)`, before its first read. Every create or update for the same pair —
whichever of the two functions calls it — serializes behind this lock for the rest of the
transaction: a second transaction blocks until the first commits or rolls back, then re-reads the
true, post-commit state before its own overlap check runs. Two disjoint pairs (different
consultants, or the same consultant on different missions) do not contend at all. Held via
`_xact_lock`, so it releases automatically at commit or rollback, matching ADR-0102 and ADR-0103's
own lock shape.

**The recorded-days false positive**: the query now excludes a recorded day from the refusal
exactly when either (a) the edited assignment's own proposed new range still covers it, or (b)
some _other_ assignment on the same `(consultantId, missionId)` — found by a `NOT EXISTS`
subquery against `public.assignments`, excluding the row being edited by its id — already covers
it. For every row that passed through `validateAssignment`'s overlap check, these two conditions
are mutually exclusive: two assignments the check accepted cannot cover the same mission day at
once, so a recorded day is covered by the assignment being edited or by exactly one other, never
both. This is still the "would this day lose its only covering assignment" question the audit's
"Done when" line asks for — narrower than the original query, not a different check. (`scripts/seed.ts`
bulk-inserts `public.assignments` directly, bypassing this check entirely — see the correction in
"Rejected option" below. The fixture data it loads happens not to overlap, so this exclusivity
holds in the seeded database too, but that is a fact about the fixtures, not a guarantee the query
relies on: if two rows both covered a day, the query would still answer correctly, only weaker
than "by construction" — see the same correction.)

The query reads `timesheet.cra_lines` by `consultant_id` alone, with no `status` filter — a
recorded day is exactly as protected whether its Cra is `draft`, `submitted`, or `validated`. This
is deliberate, not an oversight the tests happen not to catch: nothing about "does this edit still
cover this day" depends on how far the Cra carrying it has progressed, and a `validated` day —
already invoiced — is if anything the one case where getting this wrong would matter most.
`assignment-admin.int.test.ts` asserts the identical outcome across all three statuses for exactly
this reason.

## Rejected option

**A GiST exclusion constraint on `(consultant_id, mission_id, daterange(from_date, to_date))`**,
enforced by Postgres itself rather than by application code, with a typed error mapped from its
violation — the shape the audit's own wording suggested ("preferably backed by a database
constraint").

Rejected for now on two grounds. First, it requires the `btree_gist` extension (Postgres has no
built-in exclusion operator class for a scalar `TEXT` column standing in an equality position
inside a `daterange` exclusion), which is itself an extension-adoption decision — a new
capability granted to the database, not a tweak to an existing table — and deserves its own ADR
rather than riding in as a clause of this one. Second, the advisory lock closes the race for every
**concurrent HTTP write** — the actual hazard this decision exists to fix, two requests racing
each other — because `createAssignment` and `updateAssignment` are the only two ways a running API
instance writes this table, and both take the lock before either function's own first read.

**Correction** (ADR-0045): an earlier draft of this paragraph claimed no caller bypasses
`validateAssignment` at all. That is false — `scripts/seed.ts` bulk-inserts
`public.assignments` directly, once, at seed time, with no lock and no overlap check, to load
curated fixture data outside any request. It is not a second, concurrent write path competing with
the API (nothing else writes while it runs), so it does not reopen the race this ADR closes; it is
a bypass of the _check_, not of the _lock_, and the two are independent properties. A database
constraint would catch both a bypassing seed script and a bypassing future caller; the advisory
lock alone catches neither — it only serializes callers that already go through
`validateAssignment`. Reopen the exclusion constraint if seed-time data ever needs the same
guarantee the HTTP path enforces, or if a second bulk-write path is added.

## Reconsideration threshold

The lock key hashes the concatenation of `consultantId` and `missionId`; two unrelated pairs
whose concatenation collides on the same 64-bit `hashtext` value would serialize needlessly — a
correctness no-op (ADR-0102 and ADR-0103 accept the identical risk for their own lock keys), not
a wrong answer. Reopen if assignment-write throughput or concurrent-writer count ever grows enough
to make hash-collision queuing measurable, or if a second **concurrent, running-alongside-the-API**
writer of `public.assignments` is ever added — `scripts/seed.ts` does not qualify, since it runs
once, offline, with nothing else writing at the same time; a live import job or a second service
would.

## Consequences

- Two concurrent creates or edits on the same `(consultantId, missionId)` now serialize instead of
  racing: the loser observes the winner's true committed state and answers overlap/recorded-days/
  every other refusal from it, never from stale, pre-commit information.
- `updateAssignment` no longer refuses a valid edit because of a disjoint, untouched assignment on
  the same mission — the exact January-blocks-July case the audit named.
- Every create or update now costs one extra round trip (the advisory lock). Negligible next to
  the several sequential reads `validateAssignment` already makes.
- `apps/api/src/staffing/assignment-admin.int.test.ts`'s "lock proofs" section holds two real pool
  connections open to demonstrate both properties: a second writer blocks on the same pair whether
  the ranges eventually overlap or not, and unblocks into the correct outcome either way. Both were
  verified to fail (the second connection does not block at all) with the lock removed, then
  passed again with it restored.
