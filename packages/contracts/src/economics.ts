/**
 * Package 09 (P1 audit): `GET /api/v1/consultants/:id/economics?period=` — the shape both
 * `apps/api/src/economics/consultant-economics.ts` and `apps/web/src/features/marge/types.ts`
 * now share, moved verbatim from the SPA's own hand-typed copy.
 *
 * `Cjm`, `Tjm` and margin live **only** in the `marge` feature on the SPA side (BUILD-RULES §
 * Authorization, "never in a list") — moving their shape here does not relax that: nothing else
 * in `apps/web` imports these two interfaces, and the server-side control (a dedicated,
 * single-record, logged read — see `consultant-economics.ts`'s own header) is unchanged.
 */
export interface MissionEconomics {
  readonly missionId: string;
  readonly missionName: string;
  readonly quarterDays: number;
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
