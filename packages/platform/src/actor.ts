/**
 * Who is asking, as far as a repository is concerned (ADR-0003, ADR-0023).
 *
 * It lives in the kernel because both modules' repositories read it and the dependency rule
 * grants them `@erp/platform` and nothing else — the same reason the value objects moved here in
 * ADR-0033. It carries no name, no email and no session: those belong to whoever built it.
 *
 * Its opposite number is `public.consultants.role`, which is the firm's HR role and which the
 * API never reads. Two vocabularies, deliberately separate.
 */

export const ROLES = ['consultant', 'manager', 'billing'] as const;

export type Role = (typeof ROLES)[number];

export interface Actor {
  /** The identity acting. A `consultant` sees their own records by matching on it. */
  readonly consultantId: string;
  /** The `Office` the actor belongs to. Scope is bounded by it for every role. */
  readonly officeId: string;
  readonly role: Role;
}

export function isRole(candidate: unknown): candidate is Role {
  return typeof candidate === 'string' && (ROLES as readonly string[]).includes(candidate);
}
