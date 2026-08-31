import { queryOptions, useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { unwrap } from '@/lib/api-client';

import { fetchPreFacturier } from './api';
import type { PreFacturierResponse } from './types';

// Kept private on purpose: `features/cra/hooks.ts`'s `useValidateCra`/`useRefuseCra` invalidate
// this same key's *prefix* (`['pre-facturier']`) after a decision, but as a hardcoded literal
// rather than an import of this function — importing it would make `features/cra` depend on
// `features/pre-facturier`, the reverse of the one direction this SPA's features use between each
// other (see `refuse-dialog.tsx`'s header in `features/cra/components/`). The two files agree on
// the string `'pre-facturier'` by convention; change one, change both.
function preFacturierQueryKey(period: string): readonly [string, string] {
  return ['pre-facturier', period] as const;
}

export function preFacturierQueryOptions(period: string) {
  return queryOptions({
    queryKey: preFacturierQueryKey(period),
    queryFn: async () => unwrap(await fetchPreFacturier(period)),
  });
}

export function usePreFacturier(period: string): UseQueryResult<PreFacturierResponse> {
  return useQuery(preFacturierQueryOptions(period));
}
