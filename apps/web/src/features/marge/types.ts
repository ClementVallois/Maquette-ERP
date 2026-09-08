/**
 * Re-exported from `@erp/contracts` rather than hand-duplicated — the single description lives
 * in `packages/contracts/src/economics.ts`, shared with
 * `apps/api/src/economics/consultant-economics.ts`.
 *
 * `Cjm`, `Tjm` and margin live **only** in this feature — no other feature's
 * `types.ts` may hold `cjmCents`, `tjmCents` or a `marginCents` field, and none does.
 */
export type { ConsultantEconomics, MissionEconomics } from '@erp/contracts';
