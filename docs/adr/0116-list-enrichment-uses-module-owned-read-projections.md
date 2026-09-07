# ADR-0116 — List enrichment uses module-owned read projections

- **Date**: 2026-09-07
- **Status**: accepted

## Context

The invoice list and pré-facturier started from `InvoiceListItem`, then loaded every listed
`Invoice` aggregate to discover its source Cra, missions, line count, and provisional totals. They
then loaded each source `Cra` aggregate separately. The number of database queries therefore grew
with the page length: the package 15 regression proof measured 15 queries for one invoice and 20
for two. Invoice history repeated the whole pré-facturier composition for three periods merely to
obtain three HT sums. These are read concerns; hydrating mutable write aggregates adds work without
strengthening a rule.

The sealed modules remain responsible for their own tables. Billing cannot join `timesheet.cras`,
and timesheet cannot join `billing.invoices`. The application composition may combine scoped
projections from both modules and labels from `public.*`.

## Decision

Billing exposes a list projection containing source Cra id, mission ids, line count, and exact
HT/TTC totals, calculated from billing-owned rows in one query. Timesheet exposes batch list reads
for known Cra ids and for one complete period. The application joins these projections in memory.
Invoice history uses billing's direct scoped HT sum instead of invoking the screen composition.

The projection prefers frozen totals when present and derives draft totals from stored integer line
amounts and VAT groups, matching the existing list query. It does not reproduce tax arithmetic:
VAT remains calculated and rounded by the domain before its group rows are stored.

## Rejected option

A cross-module SQL query joining billing and timesheet tables was rejected because it would bypass
the module boundary the repository enforces in code. Loading each aggregate behind a cache was also
rejected: it would retain the page-dependent work and create another owner for mutable request data.

## Reconsideration threshold

Reconsider the in-memory join when measured production-sized pages make it a latency or memory
bottleneck, or when a separately deployed read store becomes a real requirement. At that point a
deliberate reporting projection with its own refresh and authorization guarantees may be warranted.

## Consequences

Invoice list query count is independent of page length, and pré-facturier no longer reloads every
invoice or Cra aggregate. The module interfaces gain read-specific methods and projection types.
The application still owns cross-module composition, so authorization remains enforced by each
module before its rows are combined.
