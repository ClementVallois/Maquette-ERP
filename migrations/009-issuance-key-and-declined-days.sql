-- Two columns the API needs, and neither is optional in the sense that matters: without them a
-- header and a table would both be present and prove nothing.

-- `Idempotency-Key` on the one POST that allocates a number (ADR-0021, ADR-0044). Stored, because
-- a header that is required and recorded nowhere guards nothing: with it, replaying the same key
-- answers the original document instead of burning a second number.
ALTER TABLE billing.invoices ADD COLUMN issuance_idempotency_key TEXT;

-- Partial, because every draft invoice has a NULL key and NULLs are distinct in a plain UNIQUE
-- index — but the point here is to make a *reuse* visible, not to permit a thousand NULLs.
CREATE UNIQUE INDEX idx_invoices_issuance_idempotency_key
ON billing.invoices (issuance_idempotency_key)
WHERE issuance_idempotency_key IS NOT NULL;

-- `billing.declined_days` was created in migration 003 and read by nothing (open question,
-- 19/08/2026). It gets its writer and its reader in this phase: the days a validated Cra carried
-- that produced no invoice line, with the reason (ADR-0037), which is the blocking-reason column
-- of the pré-facturier. Two columns were missing for that to be possible.

-- Scope. Every read in this application is bounded by an Office (ADR-0003), and a table with no
-- office column can only be read unscoped.
ALTER TABLE billing.declined_days ADD COLUMN office_id TEXT NOT NULL REFERENCES public.offices(id);

CREATE INDEX idx_declined_days_office_id ON billing.declined_days(office_id);

-- Idempotency, for the same reason the invoice has one: replaying a validation must not append a
-- second copy of the same refusal. One row per (Cra, mission, reason) is the natural key —
-- ADR-0037 produces at most one decline per mission per Cra.
CREATE UNIQUE INDEX idx_declined_days_cra_mission_reason
ON billing.declined_days (cra_id, mission_id, reason);
