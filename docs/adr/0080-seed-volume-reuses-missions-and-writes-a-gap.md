# ADR-0080 — Seed volume extends existing missions and lets a credit note leave a numbering gap

- **Date**: 2026-08-31
- **Status**: accepted

## Context

Item 6 (QA round 1) asks the seed for three things that interact: 10+ consultants per manager,
dense 2026-06/07/08 for every active consultant, and sparse historical CRAs/invoices back to 2016
for a subset of veterans, including one departure. Two concrete design questions had to be settled
before the roster could be written, both narrower than a fresh architectural decision but real
enough that a later reader would ask "why this way and not the obvious other one":

**How does a veteran's historical Cra get a resolvable Tjm?** `draftInvoicesFrom` resolves a
mission's Tjm at `lastDayOf(period)` (ADR-0017/ADR-0034); a 2016-06 Cra on a mission whose only
`mission_tjm` row starts in 2026 resolves nothing and the day is declined `noAgreedRate`. Some
mission has to carry a rate valid in 2016.

**What happens to `billing.invoices.invoice_number` when a seeded credit note cancels an issued
invoice?** ADR-0057 (migration 010) dropped the credit-note table: it existed, held no row, and
was read by nothing. `creditNote()` still takes the next sequence in the same series as part of
building the note and marks the invoice `cancelledByCreditNote` — the number it took is real, and
nothing this repository has a table for is behind it.

## Decision

**Three existing missions grow a historical rate window instead of the seed gaining parallel
"legacy" missions.** `mAuditDora`, `mSocReunion` and `mGrcGuyane` had their `startDate` pushed back
to `2016-01-01` (unchanged `endDate: null`), and `missionTjm` gained one flat-rate window per
mission covering `2016-01-01` through the day before each mission's existing 2026 entry starts —
non-overlapping, so every 2026 invoice this dataset already produced (Alice's, Claire's, David's)
resolves exactly the Tjm it always did. Three veterans (`julien`, `camille`, `theo`) and one
departed consultant (`marine`) are assigned to these same mission ids from 2016, so a decade of one
mission's own lifetime is what a historical Cra resolves against — not a second mission that exists
only to be historical.

**The seed writes one credit note (Julien's 2022-06 invoice), and the gap it leaves in
`invoice_number` is accepted as the correct, visible trace of a document this mockup does not
persist.** `creditNote()` is called exactly where the production issuance chain would call it —
after the invoice is already `issued`, taking the next sequence in the same series, mutating the
invoice to `cancelledByCreditNote` — and the `CreditNote` value it returns is discarded, exactly as
ADR-0057 already established. The sequence number the credit note consumed is not reused and not
skipped-over in the seed's own accounting: `billing.numbering_series.last_sequence` reflects it,
gapless per `(entity, fiscalYear)` as ADR-0007 requires, and the _document_ series
(`invoice_number` values actually present in `billing.invoices`) shows a one-number hole at exactly
the row that has no invoice — a credit note issued and never stored.

## Rejected option

**A parallel "historical" mission per veteran** (`mAuditDoraLegacy`, and so on), never staffed by
the 2026 consultants. Rejected: it would double the missions this file has to keep coherent for no
behavioural difference — the same client, the same territoriality, the same VAT treatment — and it
would misstate the thing item 6 is actually demonstrating, which is one mission's _whole_ lifetime,
not two missions that happen to share a name.

**Skip `cancelledByCreditNote` in the seed entirely**, leaving "several different statuses" to mean
draft and issued only. Rejected: the third status is the one this mockup's whole domain model
exists to prove correct (`Invoice.cancelByCreditNote()`, the separate `CreditNote` value, ADR-0036,
ADR-0057's own deliberate table drop) — a seed that never reaches it leaves the one path a reviewer
is most likely to ask about undemonstrated.

**Fabricate a row in a resurrected credit-note table** so the gap has a document behind it.
Rejected outright: ADR-0057 is not reopened by a seed script. Its own reconsideration threshold
(printing, or a second correction type) is not met, and inserting a row a migration deliberately
dropped is exactly the kind of state-the-domain-does-not-hold BUILD-RULES' own migration rule
warns against.

## Reconsideration threshold

**A second historical rate change inside the 2016–2025 span** — the day a reviewer needs to see a
Tjm move mid-history rather than only "then vs. now" — is the threshold for splitting the one flat
historical window per mission into several. **A printed credit note, or a second correction type**
is ADR-0057's own threshold, unchanged by this ADR: the day either is needed, the dropped table is
rebuilt properly rather than papered over here.

## Consequences

**Easy.** No new mission, no new client, no new territoriality case to seed or test — the existing
four-territoriality, five-mission dataset carries its own history. The Tjm-resolution invariant
(`draftInvoicesFrom` resolving a rate `on = lastDayOf(period)`) is exercised against a genuinely
different rate (720 €/j historical vs. 800 €/j current on `mAuditDora`, for instance), which a
seed that reused today's rate for 2016 would not have proven.

**A reader who greps `billing.invoices` for a specific `invoice_number` and finds it missing has
to already know this ADR, or `Invoice.cancelByCreditNote`'s own comment, to not read the hole as
a bug.** Both name it; a support ticket asking "where did number N go" is answered by this file.
