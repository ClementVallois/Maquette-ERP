-- The persisted journal of domain events (ADR-0020). Written in the same transaction as the
-- state change, carrying correlationId and causationId for the audit trail.

CREATE TABLE public.domain_events (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  version         INTEGER NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  correlation_id  TEXT NOT NULL,
  causation_id    TEXT,
  payload         JSONB NOT NULL
);

CREATE INDEX idx_domain_events_type ON public.domain_events(type);
CREATE INDEX idx_domain_events_correlation_id ON public.domain_events(correlation_id);
CREATE INDEX idx_domain_events_occurred_at ON public.domain_events(occurred_at);
