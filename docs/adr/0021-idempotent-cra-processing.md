# ADR-0021 — Idempotent CRA processing

- **Date**: 2026-08-18
- **Status**: accepted

## Context

A validated CRA produces one invoice per client (ADR-0038). The same `TimesheetValidated` event can
be received twice — a retry after a transient failure, a bug in the dispatcher, or an operator
replaying from the event journal. The second time, no new invoice must appear, no new sequence
number must be burned, and no error must be raised. That is the contract standard `Idempotency-Key`
semantics describes: **replay → original result, not rejection**.

The plan originally named a `UNIQUE(cra_id)` constraint on the draft table. ADR-0038 changed the
cardinality — one CRA now legitimately produces several invoices (one per client) — so the
constraint is `UNIQUE(source_cra_id, billed_to_client_id)`: a CRA produces at most one invoice
per client.

## Decision

Idempotency is a **two-layer** defence:

1. **Application guard.** Before drafting, the caller queries the repository: _has this CRA already
   been processed?_ If yes, the handler returns without drafting, without allocating a sequence
   number, and without raising an error. The method is `InvoiceRepository.hasCraBeenProcessed` — it
   takes a CRA id and returns a boolean. It is a deliberate exception to the office-scoped reads
   (ADR-0003): it is an internal invariant check that returns a boolean and exposes no data.

2. **Database constraint (safety net).** A unique index on `(source_cra_ids[1], billed_to_client_id)`
   catches the race condition where two transactions both pass the guard. When the index fires,
   `saveDraft` catches the Postgres `23505` (unique violation) on that specific constraint name and
   rethrows it as `CraAlreadyProcessedError` — a typed `BusinessError` with a `problemType`, not a
   raw database exception crossing the repository boundary.

**The contract is no-op, not rejection.** The application guard makes the handler a no-op on
replay. The constraint is reached only in a race — the same CRA processed by two concurrent
transactions — and raises a typed error so the caller can decide to retry or surface a 409.
Phase 5 maps the `CraAlreadyProcessedError` to `409 Conflict` with the RFC 9457 problem type.

## Rejected option

**A separate `billing.processed_cras` table.** Tracking processed CRAs in a dedicated table is
simpler to query but duplicates information already carried by `source_cra_ids` on the invoice.
The constraint on the existing column is one index, not one table — less surface, same guarantee.

## Reconsideration threshold

When a CRA legitimately produces invoices to the same client from different fiscal periods (the
event carries multiple months), the constraint must be extended with the supply period. In the
current model, one CRA = one month = one supply period, so the two-column constraint suffices.

## Consequences

- `InvoiceRepository` gains `hasCraBeenProcessed(craId)`.
- `CraAlreadyProcessedError` is a typed `BusinessError`.
- Migration 006 adds the unique index.
- BUILD-PLAN task 3.6 is corrected from `UNIQUE(cra_id)` to
  `UNIQUE(source_cra_ids[1], billed_to_client_id)`.
