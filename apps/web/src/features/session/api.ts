import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { PersonasResponse, SelectPersonaResponse, SessionResponse } from './types';

/**
 * The four fetch functions of `Annexe A — Session`. Never called from a component directly
 * (frontend-plan.md §2: "Aucun composant n'appelle fetch ni n'importe api.ts directement —
 * uniquement les hooks"); `hooks.ts` is the only caller.
 */

export function fetchPersonas(): Promise<ApiResult<PersonasResponse>> {
  return apiFetch<PersonasResponse>('/api/v1/personas');
}

export function fetchSession(): Promise<ApiResult<SessionResponse>> {
  return apiFetch<SessionResponse>('/api/v1/session');
}

export function selectPersona(key: string): Promise<ApiResult<SelectPersonaResponse>> {
  return apiFetch<SelectPersonaResponse>('/api/v1/session/persona', {
    method: 'POST',
    body: { key },
  });
}

export function clearPersona(): Promise<ApiResult<SessionResponse>> {
  return apiFetch<SessionResponse>('/api/v1/session/persona', { method: 'DELETE' });
}
