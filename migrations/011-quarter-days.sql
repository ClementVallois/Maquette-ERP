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

-- Postgres 18 gives a NOT NULL constraint a name of its own, and `RENAME COLUMN` does not follow
-- it: without these three the catalogue still answers `cra_lines_half_days_not_null` for a column
-- called `quarter_days`. A stale name in `\d` is a unit that reads as two different things
-- depending on where a reader looks.
ALTER TABLE timesheet.cra_lines
  RENAME CONSTRAINT cra_lines_half_days_not_null TO cra_lines_quarter_days_not_null;
ALTER TABLE billing.invoice_lines
  RENAME CONSTRAINT invoice_lines_quantity_half_days_not_null
  TO invoice_lines_quantity_quarter_days_not_null;
ALTER TABLE billing.declined_days
  RENAME CONSTRAINT declined_days_half_days_not_null TO declined_days_quarter_days_not_null;
