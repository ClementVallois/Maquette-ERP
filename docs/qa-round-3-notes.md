# QA round 3 — implementation notes

Short notes on anything that needed a judgment call, for Clement to convert into proper ADRs where
warranted. Not exhaustive documentation — see the commit messages for the rest.

## Item 27 — kept the trailing period

The item's target string was given as `'Une journée ne peut pas dépasser le volume horaire
prévu'` (no trailing period). Every other entry in `problem.sentences` (both label files) ends
with a period, including its immediate neighbours. Shipped with the period, on the assumption the
period was dropped incidentally when the item was written down, not a deliberate instruction to
break the file's own punctuation convention. Flagging in case that reading is wrong.

## Item 25 — could not reproduce the alphabetical sort, fixed it defensively anyway

Searched every period-bearing Select/column in `apps/web` (the CRA table's year/month filters,
the pré-facturier's `PeriodSelector`, the invoice list's own `period` column) — everywhere else a
period list is either built server-side already sorted on the raw `YYYY-MM` key (descending,
`offeredPeriods` in `apps/api/src/composition/pre-facturier.ts`) or is a fixed 1-12 month-number
list. The one column matching the item's exact wording ("Période d'exécution" is `LABELS.invoice
.supplyPeriod`, the `/factures` table's `period` column header) already sorted by `row.supplyPeriod`
(the raw key) via TanStack's default `accessorFn`-based sort, which should already be chronological
by construction. Could not reproduce a live alphabetical-sort bug from reading the code alone (no
browser available in this pass). Made the column's `sortingFn` explicit anyway — a direct
`localeCompare` on the raw key — so the sort no longer depends on TanStack's `auto` column-type
detection, which is the only mechanism that could plausibly have produced the reported symptom.
Worth a five-minute look in a real browser before calling this closed.

## Item 31 — the timeline is a third display site

The brief named the CRA banner (consultant + manager read). `apps/web/src/features/cra/components/cra-timeline.tsx`
repeats the same manager reason as the business timeline's "CRA refusé" entry `detail`. Confirmed
in `apps/api/src/routes/api.ts`'s `craTimeline` builder that `detail` is only ever populated for
the `refused` timeline kind (never for `submitted`/`validated`), so prefixing it there
unconditionally is safe and was added in a follow-up commit.
