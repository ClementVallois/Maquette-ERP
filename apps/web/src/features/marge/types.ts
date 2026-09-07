/**
 * Package 09 (P1 audit): re-exported from `@erp/contracts` rather than hand-duplicated — the
 * single description now lives in `packages/contracts/src/economics.ts`, shared with
 * `apps/api/src/economics/consultant-economics.ts`. That file also carries the confirmed-against-
 * the-route history this file used to hold.
 *
 * `Cjm`, `Tjm` and margin live **only** in this feature (Annexe C.12) — no other feature's
 * `types.ts` may hold `cjmCents`, `tjmCents` or a `marginCents` field, and none does.
 */
export type { ConsultantEconomics, MissionEconomics } from '@erp/contracts';
