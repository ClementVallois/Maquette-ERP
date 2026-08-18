-- Per-module schemas: the boundary visible down to the database.
CREATE SCHEMA IF NOT EXISTS timesheet;
CREATE SCHEMA IF NOT EXISTS billing;

-- The app role's default privileges on public are granted in 01-roles.sh (the init script).
-- These schemas did not exist then, so the per-schema grants happen here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA timesheet TO erp_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE erp_migration IN SCHEMA timesheet
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE erp_migration IN SCHEMA timesheet
      GRANT USAGE, SELECT ON SEQUENCES TO erp_app';
    EXECUTE 'GRANT USAGE ON SCHEMA billing TO erp_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE erp_migration IN SCHEMA billing
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE erp_migration IN SCHEMA billing
      GRANT USAGE, SELECT ON SEQUENCES TO erp_app';
  END IF;
END
$$;

-- Reference tables shared across modules live in the public schema. The modules' own tables
-- reference these by fully-qualified name.

CREATE TABLE public.offices (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL
);

CREATE TABLE public.practices (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL
);

CREATE TABLE public.consultants (
  id          TEXT PRIMARY KEY,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  office_id   TEXT NOT NULL REFERENCES public.offices(id),
  practice_id TEXT NOT NULL REFERENCES public.practices(id),
  role        TEXT NOT NULL CHECK (role IN ('consultant', 'manager', 'director'))
);

CREATE INDEX idx_consultants_office_id ON public.consultants(office_id);
CREATE INDEX idx_consultants_practice_id ON public.consultants(practice_id);

CREATE TABLE public.clients (
  id                              TEXT PRIMARY KEY,
  name                            TEXT NOT NULL,
  siren                           TEXT,
  intra_community_vat_number      TEXT,
  territoriality                  TEXT NOT NULL CHECK (territoriality IN (
    'metropolitanFrance', 'overseasWithVat', 'overseasOutsideVatScope', 'europeanUnion'
  )),
  billing_address_street          TEXT NOT NULL,
  billing_address_postal_code     TEXT NOT NULL,
  billing_address_city            TEXT NOT NULL,
  billing_address_country         TEXT NOT NULL,
  delivery_address_street         TEXT,
  delivery_address_postal_code    TEXT,
  delivery_address_city           TEXT,
  delivery_address_country        TEXT
);

CREATE TABLE public.missions (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES public.clients(id),
  name            TEXT NOT NULL,
  billing_model   TEXT NOT NULL CHECK (billing_model IN ('Regie', 'Forfait')),
  start_date      DATE NOT NULL,
  end_date        DATE
);

CREATE INDEX idx_missions_client_id ON public.missions(client_id);

-- Dated TJM: the rate in force during a period, in integer cents.
CREATE TABLE public.mission_tjm (
  id          TEXT PRIMARY KEY,
  mission_id  TEXT NOT NULL REFERENCES public.missions(id),
  from_date   DATE NOT NULL,
  to_date     DATE,
  tjm_cents   BIGINT NOT NULL CHECK (tjm_cents > 0 AND tjm_cents % 100 = 0)
);

CREATE INDEX idx_mission_tjm_mission_id ON public.mission_tjm(mission_id);

CREATE TABLE public.assignments (
  id              TEXT PRIMARY KEY,
  consultant_id   TEXT NOT NULL REFERENCES public.consultants(id),
  mission_id      TEXT NOT NULL REFERENCES public.missions(id),
  from_date       DATE NOT NULL,
  to_date         DATE
);

CREATE INDEX idx_assignments_consultant_id ON public.assignments(consultant_id);
CREATE INDEX idx_assignments_mission_id ON public.assignments(mission_id);

-- Dated manager attachment: who manages whom, and when.
CREATE TABLE public.manager_attachments (
  id              TEXT PRIMARY KEY,
  consultant_id   TEXT NOT NULL REFERENCES public.consultants(id),
  manager_id      TEXT NOT NULL REFERENCES public.consultants(id),
  from_date       DATE NOT NULL,
  to_date         DATE
);

CREATE INDEX idx_manager_attachments_consultant_id ON public.manager_attachments(consultant_id);
CREATE INDEX idx_manager_attachments_manager_id ON public.manager_attachments(manager_id);

-- The legal entity issuing invoices.
CREATE TABLE public.legal_entities (
  id                              TEXT PRIMARY KEY,
  name                            TEXT NOT NULL,
  legal_form                      TEXT NOT NULL,
  share_capital_cents              BIGINT NOT NULL CHECK (share_capital_cents > 0),
  siren                           TEXT NOT NULL,
  intra_community_vat_number      TEXT NOT NULL,
  rcs_registration                TEXT NOT NULL,
  address_street                  TEXT NOT NULL,
  address_postal_code             TEXT NOT NULL,
  address_city                    TEXT NOT NULL,
  address_country                 TEXT NOT NULL,
  number_prefix                   TEXT NOT NULL
);
