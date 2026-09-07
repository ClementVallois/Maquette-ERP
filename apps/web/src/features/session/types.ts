/**
 * Package 09 (P1 audit): re-exported from `@erp/contracts` rather than hand-duplicated. This file
 * stays so every other file in this feature keeps importing `./types` — the single description
 * now lives in `packages/contracts/src/session.ts`, shared with `apps/api/src/routes/session.ts`.
 */
export type {
  PersonasResponse,
  PersonaSummary,
  Role,
  SelectPersonaResponse,
  SessionResponse,
} from '@erp/contracts';
