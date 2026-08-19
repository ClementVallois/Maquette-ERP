-- The selectable identities the mockup offers instead of authentication (ADR-0023).
--
-- Reference data, written by the deterministic seed and by nothing else (ADR-0031). It is a table
-- rather than a constant in the application for two reasons: the consultant ids it points at are
-- assigned by the seed's counter, so the API could not hardcode them; and `public.consultants.role`
-- is the firm's HR role — `consultant | manager | director` — which is a different vocabulary and
-- which the API never reads.

CREATE TABLE public.personas (
  -- The technical id, UUIDv7 like every other (ADR-0041) …
  id             TEXT PRIMARY KEY,
  -- … and the business reference: the value that travels in the signed cookie and appears in a
  -- URL a reader is meant to be able to type. Same split as invoice_number versus invoices.id.
  key            TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL CHECK (role IN ('consultant', 'manager', 'billing')),
  consultant_id  TEXT NOT NULL REFERENCES public.consultants(id),
  display_order  INTEGER NOT NULL UNIQUE
);

CREATE INDEX idx_personas_consultant_id ON public.personas(consultant_id);
