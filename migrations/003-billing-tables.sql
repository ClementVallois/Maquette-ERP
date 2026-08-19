-- The invoice numbering series, invoices, lines, and credit notes in the billing schema.

-- Gapless numbering counter: one row per (entity, fiscal_year), locked with SELECT FOR UPDATE
-- at issuance (ADR-0007). Never a Postgres SEQUENCE — nextval is not transactional.
CREATE TABLE billing.numbering_series (
  entity_id     TEXT NOT NULL,
  fiscal_year   INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_id, fiscal_year)
);

CREATE TABLE billing.invoices (
  id                              TEXT PRIMARY KEY,
  seller_id                       TEXT NOT NULL REFERENCES public.legal_entities(id),
  status                          TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'issued', 'cancelledByCreditNote')),
  supply_period                   TEXT NOT NULL,  -- YYYY-MM
  -- BilledParty snapshot — copied at drafting, never read back.
  billed_to_client_id             TEXT NOT NULL,
  billed_to_name                  TEXT NOT NULL,
  billed_to_siren                 TEXT,
  billed_to_vat_number            TEXT,
  billed_to_billing_street        TEXT NOT NULL,
  billed_to_billing_postal_code   TEXT NOT NULL,
  billed_to_billing_city          TEXT NOT NULL,
  billed_to_billing_country       TEXT NOT NULL,
  billed_to_delivery_street       TEXT NOT NULL,
  billed_to_delivery_postal_code  TEXT NOT NULL,
  billed_to_delivery_city         TEXT NOT NULL,
  billed_to_delivery_country      TEXT NOT NULL,
  -- Payment terms
  payment_terms_kind              TEXT NOT NULL CHECK (payment_terms_kind IN ('net', 'endOfMonth')),
  payment_terms_days              INTEGER NOT NULL,
  -- Legal mentions
  mentions_operation_category     TEXT NOT NULL,
  mentions_early_payment_kind     TEXT NOT NULL,
  mentions_early_payment_rate     INTEGER,
  mentions_late_penalty_rate      INTEGER NOT NULL,
  mentions_recovery_indemnity     BIGINT NOT NULL,
  -- Issuance fields — null until issued.
  invoice_number                  TEXT UNIQUE,
  issue_date                      DATE,
  series_entity_id                TEXT,
  series_fiscal_year              INTEGER,
  due_date                        DATE,
  -- Frozen totals — null until issued.
  total_ht_cents                  BIGINT,
  total_tax_cents                 BIGINT,
  total_ttc_cents                 BIGINT,
  -- The validators whose days produced this invoice (separation of duties).
  validated_by                    TEXT[] NOT NULL DEFAULT '{}',
  -- Idempotency: which CRA(s) produced this invoice.
  source_cra_ids                  TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_invoices_seller_id ON billing.invoices(seller_id);
CREATE INDEX idx_invoices_billed_to_client_id ON billing.invoices(billed_to_client_id);

CREATE TABLE billing.invoice_lines (
  id                    TEXT PRIMARY KEY,
  invoice_id            TEXT NOT NULL REFERENCES billing.invoices(id),
  line_order            INTEGER NOT NULL,
  designation           TEXT NOT NULL,
  -- Origin
  origin_kind           TEXT NOT NULL,
  origin_mission_id     TEXT,
  origin_cra_id         TEXT,
  origin_period         TEXT,
  origin_half_days      INTEGER,
  origin_tjm_cents      BIGINT,
  -- Amounts
  quantity_half_days    INTEGER NOT NULL,
  unit_price_cents      BIGINT NOT NULL,
  amount_cents          BIGINT NOT NULL,
  -- VAT
  vat_kind              TEXT NOT NULL CHECK (vat_kind IN ('taxable', 'notCharged')),
  vat_basis_points      INTEGER,
  vat_not_charged_reason TEXT
);

CREATE INDEX idx_invoice_lines_invoice_id ON billing.invoice_lines(invoice_id);

-- VAT breakdown per invoice, per rate group — persisted so the document is self-contained.
CREATE TABLE billing.invoice_vat_groups (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT NOT NULL REFERENCES billing.invoices(id),
  group_key       TEXT NOT NULL,
  base_cents      BIGINT NOT NULL,
  tax_cents       BIGINT NOT NULL,
  UNIQUE (invoice_id, group_key)
);

CREATE INDEX idx_invoice_vat_groups_invoice_id ON billing.invoice_vat_groups(invoice_id);

CREATE TABLE billing.credit_notes (
  id                    TEXT PRIMARY KEY,
  invoice_id            TEXT NOT NULL REFERENCES billing.invoices(id),
  reason                TEXT NOT NULL,
  document_number       TEXT UNIQUE,
  issue_date            DATE,
  series_entity_id      TEXT,
  series_fiscal_year    INTEGER,
  total_ht_cents        BIGINT NOT NULL,
  total_tax_cents       BIGINT NOT NULL,
  total_ttc_cents       BIGINT NOT NULL
);

CREATE INDEX idx_credit_notes_invoice_id ON billing.credit_notes(invoice_id);

-- Declined days: half-days from a validated CRA that did not become invoice lines.
CREATE TABLE billing.declined_days (
  id              TEXT PRIMARY KEY,
  cra_id          TEXT NOT NULL,
  mission_id      TEXT NOT NULL,
  half_days       INTEGER NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('notRegie', 'unknownMission', 'noAgreedRate', 'unknownClient'))
);

CREATE INDEX idx_declined_days_cra_id ON billing.declined_days(cra_id);
