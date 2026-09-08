import type { Role } from '@erp/platform';

export type { Role };

/**
 * The public session shape, read by both `apps/api` and `apps/web` rather than restated in each.
 * `apps/api/src/routes/session.ts`'s
 * `view()` is typed against `PersonaSummary` below; `apps/web/src/features/session/types.ts`
 * re-exports it rather than restating it.
 */
export interface PersonaSummary {
  readonly key: string;
  readonly role: Role;
  readonly displayName: string;
  readonly office: string;
}

export interface PersonasResponse {
  readonly notice: string;
  readonly personas: readonly PersonaSummary[];
}

export interface SessionResponse {
  readonly persona: PersonaSummary | null;
}

export interface SelectPersonaResponse {
  readonly persona: PersonaSummary;
}
