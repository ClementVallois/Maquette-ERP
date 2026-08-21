-- `billing.credit_notes` was created in migration 003 and read by
-- nothing since (open question, 19/08/2026). ADR-0057 decides they go: the credit note stays a rule
-- of the domain — `Invoice.cancelByCreditNote()` refuses anything but an issued invoice, and that
-- refusal is what enforces "an issued invoice is never modified" — while the persistence and the
-- screen are not built, and the README says so with its threshold.
--
-- This is the one place a migration in this repository is not additive, and the exception is
-- bounded rather than general: this table has never held a row on any instance. The seed does not
-- write it and no code path can, so nothing is destroyed. A DROP touching a table with a
-- writer stays what `docs/BUILD-RULES.md` forbids.
--
-- It also settles the second half of that row. ADR-0018 decided one series holds invoices and
-- credit notes together, and the schema contradicted it: `invoices.invoice_number` and
-- `credit_notes.document_number` carried independent UNIQUE indexes, so the two kinds could share
-- a number. One series enforced by two indexes is not one series. After this there is one kind of
-- document and one index, and the shared-series rule lives where it is actually applied — in
-- `seriesKeyOf`, `sameSeries` and the locked counter row, which is keyed on (entity, fiscal year)
-- and never on the kind of document.

DROP TABLE IF EXISTS billing.credit_notes;
