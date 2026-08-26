-- ADR-0069: the quarter-day replaces the half-day as the single unit in which worked time is
-- recorded, transported and billed. `QUARTER_DAYS_PER_DAY = 4` in `@erp/platform` is the single
-- source of truth for the bound below; this migration is what makes the schema agree with it.
--
-- A rename, not a data migration: the seed is deterministic and the database resets from it
-- (ADR-0022), so there is no historical row whose meaning would silently double. ADR-0069 says
-- this is the last time that is true — the day this mockup carries data somebody cares about, a
-- unit change stops being a rename and becomes a data migration with a backup.

ALTER TABLE timesheet.cra_lines RENAME COLUMN half_days TO quarter_days;
ALTER TABLE timesheet.cra_lines DROP CONSTRAINT cra_lines_half_days_check;
ALTER TABLE timesheet.cra_lines ADD CONSTRAINT cra_lines_quarter_days_check
  CHECK (quarter_days >= 1 AND quarter_days <= 4);

ALTER TABLE billing.invoice_lines RENAME COLUMN origin_half_days TO origin_quarter_days;
ALTER TABLE billing.invoice_lines RENAME COLUMN quantity_half_days TO quantity_quarter_days;

ALTER TABLE billing.declined_days RENAME COLUMN half_days TO quarter_days;
