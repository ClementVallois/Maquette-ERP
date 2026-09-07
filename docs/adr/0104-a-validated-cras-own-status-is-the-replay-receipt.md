# ADR-0104 — A validated Cra's own status is the replay receipt

- **Date**: 2026-09-07
- **Status**: accepted

## Context

ADR-0021's contract for validation is "replay → original result, not rejection", checked in
`validateCraAndDraftInvoices` before the domain aggregate is touched. Until this decision, that
check was `unit.invoices.hasCraBeenProcessed(craId)` — `billing.invoices` scanned for any row
whose `source_cra_ids` names this Cra.

A Cra that validates cleanly but drafts nothing — every day an absence, every worked day on a
`Forfait` mission (declined as `notRegie`, ADR-0037), or a mix of the two — leaves no row for that
scan to find. Its second validation request (a client retry, or the concurrent second half of a
double-click) then misses the replay branch entirely and reaches `Cra.validate()` on an already-
`validated` aggregate, which correctly refuses — but with `ValidatedCraIsImmutableError`, the
generic "this record does not change" refusal, not the replayed **original result** ADR-0021
promises every other validation outcome.

**Reproduced**: validating an absence-only Cra, then validating it again, throws
`ValidatedCraIsImmutableError` instead of returning `{ kind: 'replayed', invoices: [] }`. The same
reproduces for an all-`Forfait` Cra whose only effect is a `declined_days` row.

## Decision

The check becomes `cra.status === 'validated'`, read from the same `findByIdForWrite`-locked
aggregate (ADR-0103) the function already loads before deciding anything.

This is sound because `Cra.validate()` (`packages/timesheet/src/domain/cra.ts`) is the **only**
path that sets `status: 'validated'` — reconstitution reads it back, nothing else writes it — so
the status is already the durable, unique, transactional fact ADR-0021 asks for: written in the
same row, in the same transaction, as the validation it records, true for a mixed-billing,
all-Forfait, all-declined, or absence-only Cra alike. `findDraftedFrom` and `findDeclinedDays` still
populate the replayed response's `invoices` and `declined` — correctly empty where nothing was
drafted, which is what makes an absence-only replay answer `{ invoices: [] }` rather than nothing
at all.

`InvoiceRepository.hasCraBeenProcessed` is removed — interface, `PgInvoiceRepository`
implementation, and its two dedicated tests — rather than left unused: it existed for exactly this
one call site, and a repository method nothing calls is a claim about a capability the codebase no
longer makes. Its own test coverage moves to what already exercises the same persisted fact from
the other side: `findDraftedFrom`'s "still finds the invoice by its source Cra after it is issued"
case.

## Rejected option

**A dedicated `processed_cras` table** (or an equivalent receipt row), inserted once per successful
validation regardless of its billing outcome, checked instead of scanning `billing.invoices`.

This is the general answer — it works even if a future validation outcome needs a receipt that is
neither an invoice nor a decline — and it is what ADR-0021 itself already rejected once, for the
same reason: it duplicates a fact the Cra's own row already carries. Adding it back for this
narrower fix would reintroduce a second source of truth for "was this Cra validated" (the new
table, and the Cra's `status` column) that could drift — a receipt row surviving a Cra somehow
reverted, or the reverse — for no capability the status column does not already have. **Threshold**:
reopen if a future outcome of validation needs to be recorded independently of the Cra's own
lifecycle (for example, if validation could one day be undone while the receipt must persist).

## Reconsideration threshold

Reopen if `Cra.validate()` stops being the sole writer of `status: 'validated'` — a future bulk
import or administrative correction that sets the status directly would break the "status IS the
receipt" equivalence this decision relies on, and any such path must go through the domain method
or carry its own replay guard.

## Consequences

- `validateCraAndDraftInvoices` replays consistently for every billing outcome: mixed, all-Forfait,
  all-declined, and absence-only Cras all answer `{ kind: 'replayed', … }` on a second call,
  including two simultaneous requests (proven under real concurrency in
  `apps/api/src/routes/cra-concurrency.int.test.ts`, alongside the already-existing mixed-billing
  case) and a subscriber failure followed by a clean retry (`apps/api/src/chain/validate-cra.int.test.ts`).
- One fewer repository method, and one fewer thing for `billing` to answer on `timesheet`'s behalf:
  the replay decision is now made entirely from the aggregate `validateCraAndDraftInvoices` already
  holds, before `billing` is consulted at all.
- The `declined_days` and invoice reads after the status check are unchanged, so a replayed
  response's shape (which documents came back, in what order) is identical to before this decision.
