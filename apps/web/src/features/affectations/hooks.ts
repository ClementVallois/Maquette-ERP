import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchAssignments, postAssignment, putAssignment } from './api';
import type { AssignmentCatalogue, AssignmentInput, AssignmentSaved } from './types';

const ASSIGNMENTS_QUERY_KEY = ['affectations'] as const;

export function assignmentsQueryOptions() {
  return queryOptions({
    queryKey: ASSIGNMENTS_QUERY_KEY,
    queryFn: async ({ signal }) => unwrap(await fetchAssignments(signal)),
  });
}

export function useAssignments(): UseQueryResult<AssignmentCatalogue> {
  return useQuery(assignmentsQueryOptions());
}

interface SaveAssignmentVariables {
  readonly id: string | null;
  readonly input: AssignmentInput;
}

/**
 * Per ADR-0113's dependency table (`docs/adr/0113-mutations-invalidate-every-projection-they-
 * actually-change.md`): also the dashboard — a saved assignment changes `public.assignments`,
 * exactly what `apps/api/src/staffing/staffing-snapshot.ts`'s `managerStaffingSnapshot` reads for
 * the manager dashboard's `staffing` panel. `['dashboard']` is a bare literal key for the same
 * reason `cra/hooks.ts`'s own comment on its sibling functions gives. Extracted as its own
 * function, not inlined, so it is testable directly (`hooks.test.ts`).
 */
export function invalidateAfterSaveAssignment(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]).then(() => undefined);
}

export function useSaveAssignment(): UseMutationResult<
  AssignmentSaved,
  Error,
  SaveAssignmentVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }) =>
      unwrap(await (id === null ? postAssignment(input) : putAssignment(id, input))),
    onSuccess: async () => {
      await invalidateAfterSaveAssignment(queryClient);
    },
  });
}
