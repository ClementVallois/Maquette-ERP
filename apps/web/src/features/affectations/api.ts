import { apiFetch, type ApiResult } from '@/lib/api-client';

import type { AssignmentCatalogue, AssignmentInput, AssignmentSaved } from './types';

export function fetchAssignments(): Promise<ApiResult<AssignmentCatalogue>> {
  return apiFetch<AssignmentCatalogue>('/api/v1/assignments');
}

export function postAssignment(input: AssignmentInput): Promise<ApiResult<AssignmentSaved>> {
  return apiFetch<AssignmentSaved>('/api/v1/assignments', { method: 'POST', body: input });
}

export function putAssignment(
  id: string,
  input: AssignmentInput,
): Promise<ApiResult<AssignmentSaved>> {
  return apiFetch<AssignmentSaved>(`/api/v1/assignments/${id}`, { method: 'PUT', body: input });
}
