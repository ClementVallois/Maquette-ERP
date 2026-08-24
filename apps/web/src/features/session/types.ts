/**
 * `Annexe A — Session (public)`, exactly. `Role` is the SPA's own copy of `@erp/platform`'s
 * `ROLES`/`Role` — not imported, for the same reason `lib/format.ts`'s header gives: `apps/web`
 * imports only `@erp/contracts`.
 */
export type Role = 'consultant' | 'manager' | 'billing';

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
