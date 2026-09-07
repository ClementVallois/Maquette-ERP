# ADR-0107 — The issued document freezes its seller, VAT breakdown, and due date

- **Date**: 2026-09-07
- **Status**: accepted

## Context

`billing.invoices` already freezes the client (`billed_to_*`, migration 003: "copied at drafting,
never read back") and the totals (`total_ht_cents`/`total_tax_cents`/`total_ttc_cents`, "frozen
totals — null until issued"). Three gaps sat next to those.

**The seller was never snapshotted at all.** `PgInvoiceRepository#reconstitute` called
`#loadSeller(row.seller_id)`, which read the **current** `public.legal_entities` row on every
reconstitution. Reproduced: mutate that row after issuing an invoice, reload the invoice, and the
reloaded seller carries the mutated name, SIREN, legal form, capital, and RCS registration — an
already-issued legal document whose printed identity is not fixed. No public seller-edit endpoint
is needed to falsify the persistence claim; a raw reference-data correction is sufficient, and is
exactly what a future migration or an admin fix would do.

**`Invoice#vatBreakdown` and the due date were always recomputed from current code**, never loaded
back, even though both were written correctly at issuance. `vatBreakdown` called
`vatBreakdownOf(this.#lines)` unconditionally — no frozen fallback, unlike `totals`, which already
had one ("Once the invoice is issued this returns the **frozen** copy… a total that recomputes is
a total that can change"). The due date was computed with `dueDateFrom(issueDate)` at every call
site, calling `dueDate(this.#terms, issueDate)` — again, current code over frozen inputs, never the
stored `due_date` column. Both are safe **today** only because `vatBreakdownOf` and `dueDate()` are
pure functions of already-frozen inputs (`lines`, `terms`, `issueDate`) — but a future change to
either function's rounding or business-day policy would silently change every historical document's
printed recapitulative or term on its next read, which is exactly what "frozen totals" exists to
prevent for the total line and did not, until now, prevent for the two figures next to it.

`billing.invoice_vat_groups` also could not have carried a faithful `VatTreatment` even if
`#reconstitute` had read it: `#replaceVatGroups` wrote `group.vatCents ?? 0`, collapsing "not
charged" (no tax amount at all, ADR-0010) into the same stored value as a taxed-at-zero group — the
distinction the domain's own `VatGroup.vatCents: number | null` insists on. `group_key` already
encodes the treatment losslessly (`vatGroupKey`: `"taxable:2000"` / `"notCharged:reverseChargeEuB2b"`),
so a treatment could in principle be parsed back out of it — but that is worse than storing it
directly, the same reasoning that keeps `invoice_lines.vat_kind`/`vat_basis_points`/
`vat_not_charged_reason` as columns rather than a key to be re-parsed.

## Decision

**Seller — frozen at drafting.** `billing.invoices` gains eleven `seller_*` columns (migration
013), written by `#upsertInvoice` from `invoice.seller` and never included in the `ON CONFLICT DO
UPDATE SET` list — the identical shape and the identical timing `billed_to_*` already has.
`#reconstitute` builds `LegalEntity` from these columns; `#loadSeller` and the join to
`public.legal_entities` are gone from the read path entirely. The timing is drafting, not
issuance, because a draft is already a statement of who is billing (the same reason `billedTo` is
copied at drafting, not at issue) — waiting until issuance would leave a draft's seller live and
editable, which is not what the audit's "Done when" line asks for ("changing seller/client/rate
reference data after issuance leaves the issued API detail and printable document unchanged" reads
naturally as "from the moment it is a real document", and a draft already is one on this
codebase's own terms).

**VAT breakdown and due date — frozen at issuance**, deliberately later than the seller. A draft's
lines can still change (a re-validation replaces them via `saveDraft`), so its recapitulative and
due date are provisional and must track them — freezing either at drafting would print a number
that could go stale before the document ever leaves. `Invoice` gains `#vatBreakdown` and `#dueDate`
fields with the same `null`-until-issued shape `#totals` already has; `issue()` computes and freezes
both alongside `totals`, in the same place, at the same time. `vatBreakdown`'s getter falls back to
a live computation when `null` (draft); the new `dueDate` getter does not — a draft has no issue
date to compute one from, so `null` is simply the answer, matching what every caller already did by
hand (`invoice.issueDate === null ? null : invoice.dueDateFrom(invoice.issueDate)`). `dueDateFrom`
itself is untouched: it stays a pure preview ("what would the due date be for this arbitrary
date"), used by one existing unit test and available to a future caller that needs a hypothetical,
which `dueDate` deliberately never answers.

`assertInvoiceStateIsCoherent` gains `vatBreakdown`/`dueDate` in its `issuedFields` check, so a
persisted row that is `issued` with one of the two still `null` — or a `draft` that already carries
one — is refused the same way a missing number or a draft-with-a-number already is, in both
directions.

**`invoice_vat_groups` gains typed columns.** `vat_kind`, `vat_basis_points`,
`vat_not_charged_reason` mirror `invoice_lines`' own three columns; `tax_cents` becomes nullable so
"not charged" and "taxed at zero" are distinguishable again on reload, the way `VatGroup.vatCents`
already distinguishes them in memory. `#reconstitute` reads this table only for a non-draft row
(`row.status === 'draft' ? null : this.#loadVatBreakdown(row.id)`), matching `totals`' own
null-for-draft gate even though `invoice_vat_groups` rows exist for a draft too (`saveDraft` writes
them for the list projection's `SUM`) — a draft's stored group rows are provisional data at rest,
not the frozen answer `Invoice#vatBreakdown` is allowed to report as final.

**Not frozen: the legal mention text for a not-charged group.** `#loadVatBreakdown` derives
`mention` from the stored `reason` via `NOT_CHARGED_MENTIONS[reason]` — the current lookup table,
not a stored string. `reason` itself is frozen; the sentence it maps to is not. This is a
deliberate, narrower boundary than the number-shaped freezes above: the mention is a short, fixed
disclosure sentence from a closed two-value enum, not a computed monetary result, and freezing it
would mean a fourth stored column for a risk this audit's evidence never names (its examples are
all amounts and dates). Reopen if the firm's mandatory-mention wording is ever revised and an
already-issued document is found to reprint with the new sentence.

## Rejected option

**Parse `VatTreatment` back out of `invoice_vat_groups.group_key`** instead of adding
`vat_kind`/`vat_basis_points`/`vat_not_charged_reason`. The key already encodes it losslessly, so
this would have worked. Rejected because reconstructing a typed union from a string on every read
is worse than reading it from typed columns that mirror a pattern (`invoice_lines`) this schema
already has — one string-parsing function the read path depends on staying in sync with
`vatGroupKey`'s own format is a coupling this migration removes rather than adds.

**Freeze the seller at issuance, matching VAT breakdown and due date's timing**, for a single
uniform rule ("issuance freezes everything"). Rejected because it would leave a **draft's** printed
seller live against reference-data edits, and the audit's evidence is explicit that the client and
line rates are already frozen at drafting — a seller inconsistent with that (frozen later than the
document fields it sits beside on the same printable page) would be the one field a reader notices
disagrees with the rest of the document's own stated policy.

## Reconsideration threshold

Reopen the mention-text boundary if `NOT_CHARGED_MENTIONS`' wording changes and a stakeholder needs
an already-issued document's printed sentence to survive that change unchanged — at that point
`mention` (or the `reason` → sentence mapping's version) becomes a twelfth stored column on the same
migration this one already extends.

## Consequences

- Editing `public.legal_entities`, or changing `vatBreakdownOf`'s rounding policy or
  `dueDate`'s business-day computation, no longer changes what an existing invoice reports through
  either the JSON detail route (`apps/api/src/routes/invoices.ts`, `seller: invoice.seller`) or the
  printable page (`apps/api/src/web/pages/invoice.ts`, `sellerBlock`/`vatTable`) — both project the
  reconstituted aggregate, so fixing the repository closes both projections the audit named.
- `packages/billing/src/infrastructure/columns.ts`'s `ReferencedRowMissingError` had exactly one
  call site (`#loadSeller`), removed with it; the class and its dedicated unit test are deleted as
  dead code, the same disposition package 03 gave `hasCraBeenProcessed`.
- Three raw-SQL test fixtures that predate the eleven `NOT NULL` `seller_*` columns needed updating
  (`api.int.test.ts`'s cross-office test, `issuance-concurrency.int.test.ts`'s `seedDraftInvoice`,
  `pg-invoice-repository.int.test.ts`'s pagination-cap seed) — `scripts/seed.ts` needed none, since
  it drafts and issues every invoice through the real domain (`draftInvoicesFrom` →
  `PgInvoiceRepository`), which already carries a full `LegalEntity` at that point.
- Closing this package's own local DB drift (`pnpm run db:reset`) surfaced a pre-existing,
  unrelated fragility — two integration test files silently depended on winning an unscoped
  `ORDER BY id LIMIT 1` race in `PgReferenceReader.seller()` against other files' permanently
  committed fixture rows — fixed narrowly for the two files it broke and recorded as its own
  `docs/open-questions.md` row rather than folded into this decision, which is about invoice
  history, not test-suite isolation.
- `packages/billing/src/domain/invoice.test.ts` and
  `packages/billing/src/infrastructure/pg-invoice-repository.int.test.ts` gained coherence tests
  for the two new frozen fields and a same-instrument-as-`totals` proof: seed a stored value that
  disagrees with what recomputing from the (unchanged) lines/terms would produce, and assert the
  reload reports the stored one.
