-- ADR-0107. `billing.invoices` already
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
-- Every column below is added nullable, filled, then made `NOT NULL` — never added `NOT NULL`
-- outright. A defaultless `NOT NULL` column cannot be added to a table that holds a row, and the
-- hosted instance holds the seeded invoice history (ADR-0107, addendum of 22/10/2026). The CI jobs
-- that migrate never see that: they migrate an empty service container before any seed step.
-- `tests/migration-013.int.test.ts` is the one that applies this file to populated tables.

-- Seller snapshot — copied at drafting, the same shape and the same timing as billed_to_*. An
-- existing row gets what the 012-era read path showed for it: the legal entity it points at.
ALTER TABLE billing.invoices
  ADD COLUMN seller_name TEXT,
  ADD COLUMN seller_legal_form TEXT,
  ADD COLUMN seller_share_capital_cents BIGINT,
  ADD COLUMN seller_siren TEXT,
  ADD COLUMN seller_intra_community_vat_number TEXT,
  ADD COLUMN seller_rcs_registration TEXT,
  ADD COLUMN seller_address_street TEXT,
  ADD COLUMN seller_address_postal_code TEXT,
  ADD COLUMN seller_address_city TEXT,
  ADD COLUMN seller_address_country TEXT,
  ADD COLUMN seller_number_prefix TEXT;

UPDATE billing.invoices AS i SET
  seller_name = le.name,
  seller_legal_form = le.legal_form,
  seller_share_capital_cents = le.share_capital_cents,
  seller_siren = le.siren,
  seller_intra_community_vat_number = le.intra_community_vat_number,
  seller_rcs_registration = le.rcs_registration,
  seller_address_street = le.address_street,
  seller_address_postal_code = le.address_postal_code,
  seller_address_city = le.address_city,
  seller_address_country = le.address_country,
  seller_number_prefix = le.number_prefix
FROM public.legal_entities AS le
WHERE le.id = i.seller_id;

ALTER TABLE billing.invoices
  ALTER COLUMN seller_name SET NOT NULL,
  ALTER COLUMN seller_legal_form SET NOT NULL,
  ALTER COLUMN seller_share_capital_cents SET NOT NULL,
  ALTER COLUMN seller_siren SET NOT NULL,
  ALTER COLUMN seller_intra_community_vat_number SET NOT NULL,
  ALTER COLUMN seller_rcs_registration SET NOT NULL,
  ALTER COLUMN seller_address_street SET NOT NULL,
  ALTER COLUMN seller_address_postal_code SET NOT NULL,
  ALTER COLUMN seller_address_city SET NOT NULL,
  ALTER COLUMN seller_address_country SET NOT NULL,
  ALTER COLUMN seller_number_prefix SET NOT NULL;

-- `invoice_vat_groups.group_key` already encodes a VatTreatment losslessly ("taxable:2000" /
-- "notCharged:reverseChargeEuB2b", see vatGroupKey in domain/vat.ts) — parsing it back into the
-- typed union on every read would work, but a typed column mirrors invoice_lines' own
-- vat_kind/vat_basis_points/vat_not_charged_reason columns rather than re-deriving a union type
-- from a string on the read path, and is what this migration adds. `tax_cents` genuinely was
-- lossy: `#replaceVatGroups` wrote `group.vatCents ?? 0`, collapsing "not charged" (no tax amount
-- at all, ADR-0010) into the same stored value as a taxed-at-zero group. It becomes nullable so
-- the two can be told apart on reload, the way the domain's own VatGroup.vatCents already is.
--
-- Parsing the key is exactly what this migration does once, for the rows that predate the typed
-- columns — and only there. A key matching neither shape leaves `vat_kind` null and fails the
-- `SET NOT NULL` below, which aborts the migration rather than guessing.
ALTER TABLE billing.invoice_vat_groups
  ADD COLUMN vat_kind TEXT CHECK (vat_kind IN ('taxable', 'notCharged')),
  ADD COLUMN vat_basis_points INTEGER,
  ADD COLUMN vat_not_charged_reason TEXT,
  ALTER COLUMN tax_cents DROP NOT NULL;

UPDATE billing.invoice_vat_groups SET
  vat_kind = 'taxable',
  vat_basis_points = substring(group_key FROM '^taxable:([0-9]+)$')::INTEGER
WHERE group_key ~ '^taxable:[0-9]+$';

UPDATE billing.invoice_vat_groups SET
  vat_kind = 'notCharged',
  vat_not_charged_reason = substring(group_key FROM '^notCharged:(.+)$'),
  tax_cents = NULL
WHERE group_key ~ '^notCharged:.+$';

ALTER TABLE billing.invoice_vat_groups ALTER COLUMN vat_kind SET NOT NULL;
