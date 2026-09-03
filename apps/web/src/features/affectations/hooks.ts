import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchAssignments, postAssignment, putAssignment } from './api';
import type { AssignmentCatalogue, AssignmentInput, AssignmentSaved } from './types';

const ASSIGNMENTS_QUERY_KEY = ['affectations'] as const;

export function assignmentsQueryOptions() {
  return queryOptions({
    queryKey: ASSIGNMENTS_QUERY_KEY,
    queryFn: async () => unwrap(await fetchAssignments()),
  });
}

export function useAssignments(): UseQueryResult<AssignmentCatalogue> {
  return useQuery(assignmentsQueryOptions());
}

interface SaveAssignmentVariables {
  readonly id: string | null;
  readonly input: AssignmentInput;
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
      await queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_QUERY_KEY });
    },
  });
}
