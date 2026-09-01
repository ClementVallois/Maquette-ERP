-- ADR-0079: a consultant who has left the firm is recorded as a nullable departure date on the
-- row, not a boolean flag and not a deleted row. NULL means "still with the firm" (the column's
-- own default, so every consultant the seed already writes stays unaffected without a backfill).
-- A non-NULL value is the first date the consultant is no longer staffable -- the domain
-- invariant that reads this column lives in `Cra` (packages/timesheet), not here: the database
-- does not enforce "no Cra after departure" on its own, per BUILD-RULES ("a business invariant
-- lives in the domain... the database may double it, never carry it alone").

ALTER TABLE public.consultants ADD COLUMN departure_date DATE;
