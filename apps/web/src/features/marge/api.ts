import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { ConsultantEconomics } from './types';

/**
 * `GET /api/v1/consultants/:id/economics?period=`. Manager-only on the server
 * (`forRoles('manager')`, `apps/api/src/routes/economics.ts`); billing reaches this and gets a 403
 * `insufficient-role`, which `MargeScreen` renders as `DeniedState` the same way every other
 * refusal in this SPA does — no client-side role gate duplicates the check.
 */
export function fetchConsultantEconomics(
  consultantId: string,
  period: string,
  signal?: AbortSignal,
): Promise<ApiResult<ConsultantEconomics>> {
  return apiFetch<ConsultantEconomics>(
    `/api/v1/consultants/${consultantId}/economics?period=${encodeURIComponent(period)}`,
    { signal },
  );
}
