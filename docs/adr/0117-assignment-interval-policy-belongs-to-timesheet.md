# ADR-0117 — Assignment interval policy belongs to timesheet

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Assignment creation and editing are API features, but the rules deciding whether a consultant can
be assigned over an interval are the same facts that govern whether work may be recorded: mission
dates, consultant departure, and required Habilitations held without a gap. Those rules lived as
private functions among SQL and transport problem construction in `assignment-admin.ts`. They had
33 integration cases but no test surface independent of PostgreSQL.

The timesheet domain already owns missions, assignments, dated held Habilitations, and the per-day
eligibility checks used by Cra submission. The application must still serialize assignment writes,
check persisted overlap and recorded work, and map refusals to the shared HTTP contract.

## Decision

The pure interval policy lives in the timesheet domain. It accepts already-loaded dates and
Habilitation ids and returns domain facts: invalid bounds, the relevant departure or mission dates,
or the ids whose held periods do not cover the full interval. The API staffing adapter performs the
focused SQL reads, invokes the policy, resolves display names, maps facts to transport problem types,
and persists the accepted write.

Existing domain boundary rules apply to the new source path without an exemption. PostgreSQL lock,
overlap, recorded-day, authorization, and wire-response proofs remain integration tests at their
actual boundary.

## Rejected option

A new sealed staffing package was rejected because this feature has no independent aggregate or
workflow: it maintains reference data used directly by the timesheet rules. Keeping the pure policy
inside `apps/api` was rejected because it would continue treating a business invariant as unrestricted
composition code and require PostgreSQL to test every branch.

## Reconsideration threshold

Create a separate staffing module when staffing gains an independent lifecycle with its own commands,
events, or consumers beyond timesheet eligibility. File size or another screen over the same
assignment rows is not enough.

## Consequences

Interval policy tests run without PostgreSQL and return no transport-owned shape. The adapter still
owns query efficiency and transactional consistency. Timesheet's public surface grows by one pure
policy function and its input/refusal types.
