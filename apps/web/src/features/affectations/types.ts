/**
 * The web-side twin of `apps/api/src/staffing/staffing-snapshot.ts`'s own
 * `INTERCONTRAT_MISSION_NAME` — the discriminator the manager staffing chart's deep link
 * (`?staffing=on-mission|intercontrat`) has to replicate client-side, since `apps/web` may not
 * import across the api/web boundary. Kept as a name match, not a shared constant, on purpose.
 */
export const INTERCONTRAT_MISSION_NAME = 'Intercontrat';

/**
 * Package 09 (P1 audit): re-exported from `@erp/contracts` rather than hand-duplicated — the
 * single description now lives in `packages/contracts/src/staffing.ts`, shared with
 * `apps/api/src/staffing/assignment-admin.ts`.
 */
export type {
  Assignment,
  AssignmentCatalogue,
  AssignmentInput,
  AssignmentSaved,
} from '@erp/contracts';
