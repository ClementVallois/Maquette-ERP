/**
 * `GET /api/v1/consultants/:id/economics?period=` — Annexe A, verified against the route
 * (`apps/api/src/routes/api.ts`) and `apps/api/src/economics/consultant-economics.ts`'s
 * `ConsultantEconomics`/`MissionEconomics`, both already implemented (rule 0bis.8: read the route
 * rather than guess).
 *
 * `Cjm`, `Tjm` and margin live **only** in this feature (Annexe C.12) — no other feature's
 * `types.ts` may hold `cjmCents`, `tjmCents` or a `marginCents` field, and none does.
 *
 * Only `types.ts` for Phase 3 (task 3.7); `api.ts`/`hooks.ts` land in Phase 7 with the marge
 * screen, reached only by explicit navigation from the pré-facturier (never a fetch on hover —
 * ADR-0052, each read is logged server-side).
 */
export interface MissionEconomics {
  readonly missionId: string;
  readonly missionName: string;
  readonly halfDays: number;
  readonly tjmCents: number;
  readonly revenueCents: number;
  readonly costCents: number;
  readonly marginCents: number;
}

export interface ConsultantEconomics {
  readonly consultantId: string;
  readonly displayName: string;
  readonly period: string;
  readonly cjmCents: number;
  readonly missions: readonly MissionEconomics[];
  readonly revenueCents: number;
  readonly costCents: number;
  readonly marginCents: number;
}
