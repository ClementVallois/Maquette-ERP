-- The Cra and its lines, in the timesheet schema.

CREATE TABLE timesheet.cras (
  id              TEXT PRIMARY KEY,
  consultant_id   TEXT NOT NULL REFERENCES public.consultants(id),
  office_id       TEXT NOT NULL REFERENCES public.offices(id),
  period          TEXT NOT NULL,  -- YYYY-MM
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'refused', 'validated')),
  submitted_at    TIMESTAMPTZ,
  validated_by    TEXT REFERENCES public.consultants(id),
  validated_at    TIMESTAMPTZ,
  refusal_by      TEXT REFERENCES public.consultants(id),
  refusal_at      TIMESTAMPTZ,
  refusal_reason  TEXT,
  UNIQUE (consultant_id, period)
);

CREATE INDEX idx_cras_consultant_id ON timesheet.cras(consultant_id);
CREATE INDEX idx_cras_office_id ON timesheet.cras(office_id);
CREATE INDEX idx_cras_validated_by ON timesheet.cras(validated_by);
CREATE INDEX idx_cras_refusal_by ON timesheet.cras(refusal_by);

CREATE TABLE timesheet.cra_lines (
  id          TEXT PRIMARY KEY,
  cra_id      TEXT NOT NULL REFERENCES timesheet.cras(id),
  day         DATE NOT NULL,
  day_type    TEXT NOT NULL CHECK (day_type IN ('worked', 'absence')),
  mission_id  TEXT REFERENCES public.missions(id),
  half_days   INTEGER NOT NULL CHECK (half_days >= 1 AND half_days <= 2)
);

CREATE INDEX idx_cra_lines_cra_id ON timesheet.cra_lines(cra_id);
CREATE INDEX idx_cra_lines_mission_id ON timesheet.cra_lines(mission_id);

CREATE TABLE timesheet.cra_flags (
  id          TEXT PRIMARY KEY,
  cra_id      TEXT NOT NULL REFERENCES timesheet.cras(id),
  day         DATE NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('weekend', 'publicHoliday'))
);

CREATE INDEX idx_cra_flags_cra_id ON timesheet.cra_flags(cra_id);
