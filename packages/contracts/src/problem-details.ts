/**
 * RFC 9457 `application/problem+json`.
 *
 * The three states the mockup must show — empty, error, permission denied — need a typed error
 * on the wire, or the client can only render "500". Business extensions live alongside the
 * standard members.
 */
export interface ProblemDetails {
  /**
   * A relative URI reference identifying the refusal, and the stable half of this document: a
   * client branches on `type`, never on `status`. Relative, not absolute, for the reason
   * ADR-0016 gives — the identifiers are published the moment a client reads one, and a host
   * name baked into them would be published with them.
   */
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  /** Which invariant was violated, for a 409. */
  readonly invariant?: string;
  /** Which scope or duty rule denied the request, for a 403. ADR-0003 requires it by name. */
  readonly deniedBy?: string;
  /** Per-field messages, for a 400. */
  readonly errors?: Readonly<Record<string, readonly string[]>>;
  /** The chain this refusal belongs to, so a report can be matched to a log line. */
  readonly correlationId?: string;
}

/**
 * The refusals the **API** owns, as opposed to the ones a module owns. A domain refusal carries
 * its own `problemType` (ADR-0016) and never appears here; everything below is a fact about the
 * request rather than about the business, which is exactly why the modules cannot name them.
 *
 * These were four absolute `https://erp.internal/...` URIs until Phase 5, which contradicted
 * ADR-0016's "written as a relative URI reference" and duplicated identifiers the domain already
 * published under its own names.
 */
export const API_PROBLEM_TYPES = {
  /** The request does not parse, or does not match the shape the route accepts. */
  malformedRequest: '/problems/malformed-request',
  /** No persona is selected: the caller has no identity to be authorized as. */
  noPersona: '/problems/no-persona',
  /** A persona cookie was presented and is not one this instance offers, or is not signed. */
  unknownPersona: '/problems/unknown-persona',
  /** A state-changing request arrived from an origin this instance does not serve. */
  forbiddenOrigin: '/problems/forbidden-origin',
  /**
   * The persona's role does not carry this action. Distinct from `/problems/out-of-scope`, which
   * is a *domain* refusal raised by a repository about a record that exists — this one is about
   * the action and is decided before any record is read.
   */
  insufficientRole: '/problems/insufficient-role',
  notFound: '/problems/not-found',
  /** A POST that allocates a numbered document arrived without `Idempotency-Key` (ADR-0021). */
  idempotencyKeyRequired: '/problems/idempotency-key-required',
  /**
   * The `Idempotency-Key` presented already issued a **different** document. ADR-0044's contract
   * is "same key, same invoice"; a key reused across two invoices is not a retry, and replaying
   * the first one would report a number for a document that was never issued.
   */
  idempotencyKeyReused: '/problems/idempotency-key-reused',
  databaseUnavailable: '/problems/database-unavailable',
  /** Nothing about it is published beyond the correlation id: it says nothing the caller can act on. */
  internal: '/problems/internal',
} as const;

export type ApiProblemType = (typeof API_PROBLEM_TYPES)[keyof typeof API_PROBLEM_TYPES];
