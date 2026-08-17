/**
 * RFC 9457 `application/problem+json`.
 *
 * The three states the mockup must show — empty, error, permission denied — need a typed error
 * on the wire, or the client can only render "500". Business extensions live alongside the
 * standard members.
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  /** Which invariant was violated, for a 409. */
  readonly invariant?: string;
  /** Which scope rule denied the read, for a 403. */
  readonly deniedBy?: string;
  /** Per-field messages, for a 422. */
  readonly errors?: Readonly<Record<string, readonly string[]>>;
}

export const PROBLEM_TYPES = {
  validation: 'https://erp.internal/problems/validation',
  invariant: 'https://erp.internal/problems/invariant-violated',
  outOfScope: 'https://erp.internal/problems/out-of-scope',
  separationOfDuties: 'https://erp.internal/problems/separation-of-duties',
} as const;
