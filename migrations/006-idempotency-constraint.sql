-- Idempotency: a CRA produces at most one invoice per client (ADR-0021).
-- The application checks first (domain guard); the index catches the race.
CREATE UNIQUE INDEX idx_invoices_source_cra_client
ON billing.invoices ((source_cra_ids[1]), billed_to_client_id)
WHERE source_cra_ids <> '{}';
