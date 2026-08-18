-- Authorization scope for invoices: the office whose consultant's work produced this document.
-- Carried from the TimesheetValidated event, not derived from a join (ADR-0003).
ALTER TABLE billing.invoices ADD COLUMN office_id TEXT NOT NULL REFERENCES public.offices(id);

CREATE INDEX idx_invoices_office_id ON billing.invoices(office_id);

-- Mandatory mention omitted from 003: whether the seller has opted to account for VAT on debits.
ALTER TABLE billing.invoices ADD COLUMN mentions_vat_on_debits BOOLEAN NOT NULL DEFAULT false;
