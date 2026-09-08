import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { PersonasResponse, SelectPersonaResponse, SessionResponse } from './types';

/**
 * The four session fetch functions. Never called from a component directly — `hooks.ts` is the
 * only caller.
 */

export function fetchPersonas(signal?: AbortSignal): Promise<ApiResult<PersonasResponse>> {
  return apiFetch<PersonasResponse>('/api/v1/personas', { signal });
}

export function fetchSession(signal?: AbortSignal): Promise<ApiResult<SessionResponse>> {
  return apiFetch<SessionResponse>('/api/v1/session', { signal });
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
