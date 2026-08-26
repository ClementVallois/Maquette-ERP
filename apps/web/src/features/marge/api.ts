import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { ConsultantEconomics } from './types';

/**
 * `GET /api/v1/consultants/:id/economics?period=` (Phase 7, task 7.5). Manager-only on the server
 * (`forRoles('manager')`, `apps/api/src/routes/api.ts`); billing reaches this and gets a 403
 * `insufficient-role`, which `MargeScreen` renders as `DeniedState` the same way every other
 * refusal in this SPA does — no client-side role gate duplicates the check.
 */
export function fetchConsultantEconomics(
  consultantId: string,
  period: string,
): Promise<ApiResult<ConsultantEconomics>> {
  return apiFetch<ConsultantEconomics>(
    `/api/v1/consultants/${consultantId}/economics?period=${encodeURIComponent(period)}`,
  );
}
