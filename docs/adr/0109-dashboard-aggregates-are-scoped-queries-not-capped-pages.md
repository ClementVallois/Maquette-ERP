# ADR-0109 — Dashboard aggregates are scoped queries, never a capped page

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Package 08 of an internal repository cleanup audit (kept private): `GET /api/v1/dashboard`
computed every summary figure — a role's `availablePeriods`, a consultant's `refusedPeriods`, a
manager's `pendingDecisions`/`lateCras`/`awaitingDecision`, and billing's
`draftInvoices`/`issuedInvoices`/`totalTtcIssuedCents`/`oldestDrafts` — by reading one page of
`unit.cras.list(...)` (capped at `CRA_LIST_MAX_PAGE_SIZE`, 200) or `unit.invoices.list(...)`
(capped at `MAX_PAGE_SIZE`, 50) and then filtering, counting, summing, or re-sorting that page in
JavaScript. The two caps exist for their own good reason (`ADR-0081` raised the Cra one from 50 to
200 after a real office measured 65 rows) — the defect is not the cap, it is treating a capped page
as if it were the whole office once past it.

Reproduced end to end, not only by inspection: `apps/api/src/routes/dashboard.int.test.ts` seeds an
office with 222 Cras (200 + 22 old submitted ones) and 115 issued/draft invoices across two new
"package 08" tests, confirmed failing against the pre-fix route (`pendingDecisions` read 199
instead of 221, `issuedInvoices` read 50 instead of 55 — both silently truncated, not erroring)
before the fix, and passing after. The repository-level tests in
`packages/timesheet/src/infrastructure/pg-cra-repository.int.test.ts` and
`packages/billing/src/infrastructure/pg-invoice-repository.int.test.ts` prove each new query on its
own, including axis mismatches a page-derived read cannot see at all — `recentActivity`'s sort key
(`statusChangedAt`) is not `list`'s own (`period`), so a "recent activity" feed sliced from a
period-ordered page can return rows in the wrong order even within a single page, independent of
the cap.

A second, narrower defect sat next to the first: `PgInvoiceRepository.list`'s `ORDER BY
i.supply_period DESC, i.billed_to_name` has no key that is unique across rows — two invoices for
the same client in the same month (routine: several consultants billing one client) tie, and
Postgres makes no ordering guarantee across two separate paged queries over a tie. Two pages read
back to back could repeat or drop a row with nothing in the data actually having changed.

## Decision

Six new repository methods, one per real aggregate need, each sorted and limited (or counted/
summed) in SQL rather than in the application over an already-capped array:

- `CraRepository.refusedPeriods(consultantId, actor)` — `listPeriods`'s own guarantee (`DISTINCT`,
  unbounded, office/own-scoped), narrowed to one consultant and the `refused` status.
- `CraRepository.recentActivity(actor, limit)` / `awaitingDecision(actor, limit)` — `ORDER BY` the
  actual axis (`statusChangedAt`, descending or ascending) with `LIMIT` applied after the sort, not
  before it.
- `InvoiceRepository.listPeriods(actor)` — the same `DISTINCT`, unbounded shape `CraRepository`
  already had.
- `InvoiceRepository.sumTtcCents(query)` — `count`'s own filter, summed instead of counted.
- `InvoiceRepository.oldestDrafts(actor, limit)` / `recentIssued(actor, limit)` — sorted on their
  own correct axis (`supply_period` ascending; `issue_date` descending) and limited in SQL.

`dashboard.ts`'s three role branches (`apps/api/src/routes/dashboard.ts`) now call these directly
instead of reading `unit.cras.list(...)`/`unit.invoices.list(...)` and reducing the result. The
existing `count()` methods on both repositories already had the right shape (unbounded, one row);
they were simply never called from this route — `pendingDecisions` and `lateCras` now use `count`
with a `statuses` and `beforePeriod` filter instead of `.filter(...).length` on a page.

`PgInvoiceRepository.list`'s `ORDER BY` gained `i.id` (the primary key) as a third sort key, making
the order a strict total order — a decided, structural answer to the audit's "add a unique final
sort key" instruction, not an incidental side effect of the aggregate fix above.

**Which invoice statuses count as billable/history totals (the audit's explicit "define this"
instruction):** `issuedInvoices` and `totalTtcIssuedCents` count `status = 'issued'` rows only.
`draft` is excluded because a draft's total is provisional (`totalsAreProvisional`, unrelated to
this package) and has not yet been billed. `cancelledByCreditNote` is excluded because a cancelled
invoice's number and lines still exist for provenance (package 20's own concern), but the amount it
once billed is no longer owed — counting it as issued revenue would overstate what the firm can
actually collect. This was already the _de facto_ behavior (the pre-fix code filtered
`invoice.status === 'issued'` too), never written down as a decision or tested against a fixture
that actually includes a cancelled invoice — closed by a dedicated fixture in
`apps/api/src/routes/dashboard.int.test.ts`: one invoice issued then updated to
`cancelledByCreditNote`, asserted absent from both `issuedInvoices` and `totalTtcIssuedCents`, the
"test the definition rather than inferring it from a label" instruction taken literally.

`awaitingDecision` is bounded at `CRA_LIST_MAX_PAGE_SIZE` (200), not unbounded: it is a genuine work
queue a manager scrolls, not a summary value the audit's "Done when" clause names — the same
distinction between "count exactly" and "list generously" the audit itself draws between the two.
200 is far above ADR-0081's own measured worst case (65).

## Rejected option

**Raise the caps instead.** The audit says this by name ("Do not fix this by increasing the caps")
and the reasoning holds: a bigger cap is still a cap, and the two-hundred-row test fixture in
`dashboard.int.test.ts` exists specifically because "worse than today" always has a bigger number
than whatever cap is chosen. A dedicated query is the only fix that stays correct as an office
grows past any specific size.

**One generic "dashboard aggregates" repository/read-model, hand-rolled across both modules.** Every
new method here stays inside the module that already owns the table it reads (`CraRepository` for
`timesheet.cras`, `InvoiceRepository` for `billing.invoices`) — the same boundary every other read
in this codebase already respects. Package 15 (read models) is the place a genuinely shared
projection layer would be designed, once more of these needs have accumulated; six focused methods
on the two existing repositories is not yet that.

## Reconsideration threshold

If a role's dashboard needs a query that does not fit "count", "sum", "list distinct", or "list top
N sorted" cheaply in SQL — a windowed/percentile figure, or a cross-module total invoices and Cras
both feed — revisit whether a dedicated read-model (package 15) should absorb these six methods
rather than adding a seventh ad hoc one to whichever repository is closest.

## Consequences

- `apps/api/src/routes/dashboard.ts`'s three role branches each run one extra query or two instead
  of slicing an already-loaded page — a small, bounded cost, paid once per dashboard request, for
  removing a class of bug that only appears once a real office grows past whichever cap was chosen.
- The manager and consultant branches no longer load a `CraListItem[]` array they used to compute
  five different things from; each of those five is now its own named call, which is more verbose
  but traceable to the query that actually answers it — the same trade the audit's package 14 asks
  for elsewhere in this file.
- `packages/timesheet/src/infrastructure/pg-cra-repository.ts` gained a shared `toCraListItem`
  mapper (`list`, `recentActivity`, and `awaitingDecision` all return the same row shape); no
  equivalent extraction was needed on the invoice side, where the three new list-shaped reads each
  need a slightly different `SELECT` (an extra join, a different filter) rather than a shared one.
