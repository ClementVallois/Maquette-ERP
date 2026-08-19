-- Grades and habilitations: the two reference dimensions the seed introduces that have no table
-- yet. Grade carries the default Tjm grid; Habilitation constrains an assignment.
-- BUILD-PLAN 1.4 said "Phase 3 gives it its tables, Phase 4 its rows" — this migration is the
-- exception named in the Phase 4 checkpoint.

CREATE TABLE public.grades (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  rank  INTEGER NOT NULL UNIQUE
);

-- A consultant's grade over time, with both bounds inclusive. The Cjm (cost per day, the sensitive
-- value the scope test protects) is on the grade assignment, not on the grade: the same grade may
-- carry different costs in different offices or for different seniority within the grade.
CREATE TABLE public.consultant_grades (
  id              TEXT PRIMARY KEY,
  consultant_id   TEXT NOT NULL REFERENCES public.consultants(id),
  grade_id        TEXT NOT NULL REFERENCES public.grades(id),
  from_date       DATE NOT NULL,
  to_date         DATE,
  cjm_cents       BIGINT NOT NULL CHECK (cjm_cents > 0 AND cjm_cents % 100 = 0)
);

CREATE INDEX idx_consultant_grades_consultant_id ON public.consultant_grades(consultant_id);
CREATE INDEX idx_consultant_grades_grade_id ON public.consultant_grades(grade_id);

-- Default Tjm grid: the rate a mission is initially priced at, per grade. The actual Tjm is on
-- mission_tjm and may differ; this is the starting point.
CREATE TABLE public.grade_tjm_defaults (
  id          TEXT PRIMARY KEY,
  grade_id    TEXT NOT NULL REFERENCES public.grades(id),
  from_date   DATE NOT NULL,
  to_date     DATE,
  tjm_cents   BIGINT NOT NULL CHECK (tjm_cents > 0 AND tjm_cents % 100 = 0)
);

CREATE INDEX idx_grade_tjm_defaults_grade_id ON public.grade_tjm_defaults(grade_id);

-- A certification-backed clearance. The table holds the clearance type; the join table below
-- constrains a mission to require it and a consultant to hold it.
CREATE TABLE public.habilitations (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE public.consultant_habilitations (
  id              TEXT PRIMARY KEY,
  consultant_id   TEXT NOT NULL REFERENCES public.consultants(id),
  habilitation_id TEXT NOT NULL REFERENCES public.habilitations(id),
  obtained_at     DATE NOT NULL,
  expires_at      DATE
);

CREATE INDEX idx_consultant_habilitations_consultant_id ON public.consultant_habilitations(consultant_id);

CREATE TABLE public.mission_habilitations (
  id              TEXT PRIMARY KEY,
  mission_id      TEXT NOT NULL REFERENCES public.missions(id),
  habilitation_id TEXT NOT NULL REFERENCES public.habilitations(id)
);

CREATE INDEX idx_mission_habilitations_mission_id ON public.mission_habilitations(mission_id);
