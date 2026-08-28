import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { PreFacturierResponse } from './types';

/**
 * `GET /api/v1/pre-facturier?period=` (Phase 7, task 7.1). `period` is a required query parameter
 * on this route (`PeriodQuery`, `apps/api/src/routes/api.ts`) — there is no "all periods" answer,
 * so every caller of this function already has one, either picked from the period selector or
 * computed by the route's own `beforeLoad` default (`routes/_shell/pre-facturier.tsx`).
 */
export function fetchPreFacturier(period: string): Promise<ApiResult<PreFacturierResponse>> {
  return apiFetch<PreFacturierResponse>(
    `/api/v1/pre-facturier?period=${encodeURIComponent(period)}`,
  );
}
