# ADR-0020 — Domain events persisted as the audit journal

- **Date**: 2026-08-18
- **Status**: accepted

## Context

The CRA → line → invoice trail is the _piste d'audit fiable_ — the audit trail that links a
worked day to the invoice that bills it. BUILD-RULES names it as a claim: the event that crosses
the module boundary (`timesheet.TimesheetValidated`) is the link, and it must be provable after the
fact. A subscriber that runs in-process and returns void leaves no trace; the moment the process
restarts, the trail is gone.

The `domain_events` table (migration 004) exists with columns `id`, `type`, `version`,
`occurred_at`, `correlation_id`, `causation_id`, and `payload` (JSONB). The question is how the
event reaches the table, and what guarantees the persistence.

## Decision

**Every domain event is persisted to `domain_events` in the same transaction as the state change
it describes.** A `PgEventStore` writes the event row using the same `PgClient` that the
repositories use — the same mechanism as the numbering counter (ADR-0007).

**Placement: test harness in Phase 3, application edge in Phase 5.** The event store is
cross-cutting infrastructure (not module-specific) and the platform package carries no Postgres
dependency. In Phase 3, `PgEventStore` lives in `tests/harness/` and proves the property in
integration tests. Phase 5 promotes it to `apps/api/`, where it composes with the event bus.

**The event carries `correlationId` and `causationId`.** `correlationId` ties a chain of events to
the human action that started it. `causationId` says which event caused this one. Both are indexed
and queryable, which is what makes the audit trail inspectable — "show me everything that happened
because this CRA was validated" is a `WHERE correlation_id = $1`.

## Rejected option

**An outbox table with a background relay.** The outbox pattern persists events in the same
transaction and relays them asynchronously, which decouples the emitter from the subscriber's
latency. But every subscriber in this mockup runs in-process and inside the transaction — there is
no external consumer to decouple from. An outbox adds a polling loop, an ordering guarantee, and a
deduplication strategy, all of which solve a problem that does not exist here. The threshold for
revisiting is the day a subscriber needs to call an external service — that is also the day the
outbox stops being overhead and starts being required (BUILD-RULES: "the day one does, an outbox is
required — that is the threshold").

## Reconsideration threshold

When a subscriber needs I/O outside the transaction (an HTTP call, a queue publish), the outbox
replaces the direct write.

## Consequences

- The audit trail is queryable by `correlation_id` and `type`.
- Every event is persisted at most once per transaction (the `id` is a primary key).
- The event store adds no module dependency — it is composed at the edge.
- Events are not replayed from the journal; it is an append-only audit log, not an event store in
  the event-sourcing sense.
