# ADR-0053 — The pré-facturier is a composition, not a query

- **Date**: 2026-08-21
- **Status**: accepted

## Context

The pré-facturier answers one question for a month and an office: **what is billable, and for
everything else, why not.** It is the screen `docs/BUILD-PLAN.md` § 6.4 calls central, and it is the
first screen in this repository that needs facts from **both** modules on the same page:

- which consultants have a `Cra` for the month, and what status it is in — `timesheet`;
- which draft invoices the validations produced, and what they are worth — `billing`;
- which half-days a validated `Cra` carried that produced no line, and the reason — `billing`.

Every ERP builds this screen as one report query, and the reason is obvious: a `JOIN` across the
CRA table, the invoice table and the declined-days table returns the page in a single round trip.

Two facts make that query unavailable here, and neither is an accident.

**The period is not `billing`'s to know.** `billing.declined_days` is keyed on `cra_id`; it carries
no `supply_period`, because a decline is a fact about a `Cra` and the month a `Cra` covers belongs
to the module that owns the `Cra`. Selecting a period's declines therefore means joining
`timesheet.cras` — from inside `billing`. That is the schema half of the boundary ADR-0001 seals,
and dependency-cruiser does not police SQL strings.

**A draft's total is not SQL's to compute.** `billing.invoices.total_ttc_cents` is written **only at
issuance** — a draft's totals column is `NULL` by design, because ADR-0010 rounds VAT once per rate
over the grouped base and freezing a number before the document is frozen would be a second, earlier
truth. The pré-facturier's whole subject is drafts. A `SUM(...)` in the list query would produce a
number for them, and it would be the wrong number: rounding per line and adding is not rounding per
rate, and the difference is the one-cent discrepancy accounting reports.

## Decision

**The pré-facturier is assembled at the composition root from module-owned reads, and neither the
join nor the arithmetic is pushed down into SQL.** Concretely, four rules:

- **The declined-days read takes a set of `Cra` ids, not a period.**
  `findDeclinedDays(craIds, actor)` replaces the single-id form. The caller — the composition root,
  which is allowed to know both modules — asks `timesheet` which `Cra`s the month has and hands
  `billing` the ids. `billing` never learns what a month is; one query, not one per `Cra`. The
  chain of ADR-0021 passes `[craId]` and is otherwise unchanged.
- **A draft's totals are read through the aggregate.** The screen calls `findById` per invoice of
  the month and reads `invoice.totals`, which computes from the lines through `totalsOf` — the one
  place VAT is grouped and rounded. This is an N+1 and it is deliberate: it is bounded by the same
  hard page cap as every other list (50, ADR-0003), and the alternative is a rounding rule written
  twice, once in TypeScript and once in a `SUM`.
- **The period filter is pushed into the invoice query, not applied after the cap.**
  `InvoiceListQuery` gains an optional `period`. Filtering a capped page in memory silently drops
  rows the moment an office has more than fifty invoices across all months, and a pré-facturier
  that omits an invoice is worse than one that is slow.
- **`CraListItem` carries the half-days recorded.** One `SUM` over `cra_lines` in the list query —
  a quantity, not a rate. `Cjm`, `Tjm` and margin stay out of every list view (BUILD-RULES); a
  count of half-days is what the late-days counter of ADR-0054 is made of, and fetching each `Cra`
  in full to count them would be an N+1 that buys nothing.

## Rejected option

**Add `supply_period` to `billing.declined_days` and select the month directly.** One migration, one
column, and the whole screen becomes two queries. It is the option a reader would propose, and on
performance it is right.

It loses because the column would be a copy of a fact `timesheet` owns, written by `billing`, kept
in step by nobody — and it would be the first place in this repository where one module stores
another's data to avoid asking for it. The boundary this mockup exists to demonstrate is not
"`billing` does not `import` `timesheet`"; it is that the two do not know each other's model. A
`supply_period` on a billing table is that knowledge, denormalised. The cost of the decision taken
instead is one array parameter.

**Compute the draft totals in SQL and accept that the number is indicative.** Tempting because the
pré-facturier is a preview by name — nothing is issued from it, so a cent of drift harms nobody.
It loses on what the screen is for: a manager reads it to decide whether the month is right, then
billing issues from it, and a total that changes between the preview and the document is the exact
discrepancy between work delivered and revenue invoiced that `CLAUDE.md` opens by naming. A preview
whose numbers are not the document's numbers is not a preview.

**Give `billing` a reporting read model fed by the validation event.** The scalable answer, and the
one to reach for at volume. It loses today on YAGNI, which BUILD-RULES names as the sorting
criterion: it is a third copy of data that two tables already hold, for a screen serving nine
consultants, and it would need its own consistency story on replay.

## Reconsideration threshold

Reopen when the office page exceeds the fifty-row cap in a way pagination cannot absorb — a firm of
300 consultants is six pages of the pré-facturier at the current cap, which is when the N+1 on
invoice totals becomes 300 round trips per screen rather than a handful. The fix at that point is
not SQL arithmetic: it is a `findManyById` on the invoice repository that reconstitutes a page of
aggregates in one query, keeping the totals in the domain.

Reopen the declined-days shape if `billing` ever needs to answer a question about a **month** on its
own — a VAT return, a revenue report by period. At that point `billing` has a legitimate reason to
know what a period is, and the column stops being denormalisation.

## Consequences

**Easy.** The boundary holds on the screen that had the strongest reason to break it, and that is
worth more here than the round trips: the demo can open the pré-facturier and say that the two
modules met for the first time in a page, not in a `JOIN`. The numbers shown are the numbers the
document will carry, because they come from the same function.

**Expensive.** The screen issues one query for the month's `Cra`s, one for its invoices, one for the
declines, and one per invoice for the totals. That is more round trips than a report query and the
ADR does not pretend otherwise; the bound is the page cap, and the threshold above names what
replaces it.

**A port signature changed.** `findDeclinedDays` now takes an array, so the two call sites in
`validate-cra.ts` pass a single-element one. That is deliberate rather than incidental: two methods
differing only in arity would have been the duplication this file is otherwise arguing against.
