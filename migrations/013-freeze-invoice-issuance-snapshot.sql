-- Package 06 of docs/clean-up-audit.consolidated.local.md (ADR-0107). `billing.invoices` already
-- freezes the client (`billed_to_*`, migration 003, "copied at drafting, never read back") and
-- the totals (`total_ht_cents`/`total_tax_cents`/`total_ttc_cents`, "frozen totals — null until
-- issued"). Two gaps sat next to those: the seller was never snapshotted at all (only `seller_id`,
-- a foreign key `#reconstitute` re-joined against `public.legal_entities` on every read, so
-- editing that reference row changed an already-issued invoice's printed identity), and
-- `invoice_vat_groups`/`due_date` were written correctly at issuance but never read back —
-- `Invoice#vatBreakdown` and the due-date computation always recomputed from the (frozen) lines
-- and terms using the *current* code, rather than loading the frozen output the way `totals`
-- already does.
--
-- `NOT NULL` with no default, the same way migration 005 added `office_id`: every CI job that
-- migrates (`migrations-replayed-twice`, `test-integration`, and Playwright's e2e job) does so
-- against a service container it just started, before any seed step runs, so a defaultless
-- `NOT NULL` never meets a pre-existing row there. It does on a developer's own machine if the
-- local Postgres volume already holds seeded data from before this migration — verified by
-- hitting exactly that error locally. `pnpm run db:reset` (drop the volume, migrate, reseed) is
-- the fix, not a default: this mockup has no persisted production instance to protect, so there is
-- no reason to carry a placeholder value a real row would never read.

-- Seller snapshot — copied at drafting, the same shape and the same timing as billed_to_*.
ALTER TABLE billing.invoices ADD COLUMN seller_name TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_legal_form TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_share_capital_cents BIGINT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_siren TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_intra_community_vat_number TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_rcs_registration TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_address_street TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_address_postal_code TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_address_city TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_address_country TEXT NOT NULL;
ALTER TABLE billing.invoices ADD COLUMN seller_number_prefix TEXT NOT NULL;

-- `invoice_vat_groups.group_key` already encodes a VatTreatment losslessly ("taxable:2000" /
-- "notCharged:reverseChargeEuB2b", see vatGroupKey in domain/vat.ts) — parsing it back into the
-- typed union on every read would work, but a typed column mirrors invoice_lines' own
-- vat_kind/vat_basis_points/vat_not_charged_reason columns rather than re-deriving a union type
-- from a string on the read path, and is what this migration adds. `tax_cents` genuinely was
-- lossy: `#replaceVatGroups` wrote `group.vatCents ?? 0`, collapsing "not charged" (no tax amount
-- at all, ADR-0010) into the same stored value as a taxed-at-zero group. It becomes nullable so
-- the two can be told apart on reload, the way the domain's own VatGroup.vatCents already is.
ALTER TABLE billing.invoice_vat_groups ADD COLUMN vat_kind TEXT NOT NULL
  CHECK (vat_kind IN ('taxable', 'notCharged'));
ALTER TABLE billing.invoice_vat_groups ADD COLUMN vat_basis_points INTEGER;
ALTER TABLE billing.invoice_vat_groups ADD COLUMN vat_not_charged_reason TEXT;
ALTER TABLE billing.invoice_vat_groups ALTER COLUMN tax_cents DROP NOT NULL;
