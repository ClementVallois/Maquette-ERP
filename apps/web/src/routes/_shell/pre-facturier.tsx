import { createFileRoute, redirect } from '@tanstack/react-router';
import { ReceiptTextIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { z } from 'zod';

import { EmptyState } from '@/components/feedback/empty-state';
import { craListQueryOptions } from '@/features/cra/hooks';
import { PreFacturierScreen } from '@/features/pre-facturier/components/pre-facturier-screen';
import { LABELS } from '@/lib/labels';

const PreFacturierSearch = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional(),
  craPage: z.coerce.number().int().min(1).default(1).catch(1),
  invoicePage: z.coerce.number().int().min(1).default(1).catch(1),
  pageSize: z.coerce
    .number()
    .pipe(z.union([z.literal(10), z.literal(20), z.literal(50)]))
    .default(20)
    .catch(20),
  consultantSearch: z.string().trim().max(100).optional().catch(undefined),
});

/**
 * `/pre-facturier?period=` (task 7.1). `period` is required by the API (`PeriodQuery`,
 * `apps/api/src/routes/api.ts`) but optional on this URL — a bare `/pre-facturier` (the sidebar's
 * own link, and the redirect target after choosing a persona for `manager`/`billing`, per
 * `config/navigation.ts`) defaults to the office's most recent period, the same way the
 * server-rendered pré-facturier's own `offeredPeriods(recent)[0]` does
 * (`apps/api/src/composition/pre-facturier.ts`). Computed in `beforeLoad`, mirroring `_shell.tsx`'s
 * own session guard, rather than in an effect: a redirect belongs to routing, not to render.
 *
 * When the office has never had a single Cra, there is no period to default to at all — the
 * `beforeLoad` simply returns without redirecting, and `PreFacturierScreen` renders
 * `LABELS.preFacturier.noPeriod` for an undefined period rather than calling an API that requires
 * one.
 */
export const Route = createFileRoute('/_shell/pre-facturier')({
  validateSearch: PreFacturierSearch,
  beforeLoad: async ({ context, search }) => {
    if (search.period !== undefined) return;

    const list = await context.queryClient.ensureQueryData(craListQueryOptions());
    const mostRecent = [...new Set(list.cras.map((cra) => cra.period))].sort((left, right) =>
      right.localeCompare(left),
    )[0];
    if (mostRecent === undefined) return;

    // Same framework contract as `routes/_shell.tsx`'s own `beforeLoad` redirect (see its comment
    // for why the rule does not apply here); the disable must sit on the line directly above the
    // `throw`, not above this explanation, or it silences nothing.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: '/pre-facturier', search: { period: mostRecent } });
  },
  component: PreFacturierRoute,
});

function PreFacturierRoute(): ReactElement {
  const { period, craPage, invoicePage, pageSize, consultantSearch } = Route.useSearch();
  const { persona } = Route.useRouteContext();

  // Reached only when the office has never had a single Cra, on any period — `beforeLoad` above
  // redirects to a real period the moment one exists, so this is not "no period picked yet", it is
  // "there is nothing to pick from" (task 7.6's designed empty pré-facturier is the *other* case,
  // a period that does exist but this one has no rows for — that one calls the API and gets an
  // ordinary empty response; this one never calls it, because the API requires a period).
  if (period === undefined) {
    return (
      <EmptyState
        icon={ReceiptTextIcon}
        title={LABELS.preFacturier.noPeriod}
        body={LABELS.preFacturier.noPeriodHint}
      />
    );
  }

  return (
    <PreFacturierScreen
      period={period}
      role={persona.role}
      craPage={craPage}
      invoicePage={invoicePage}
      pageSize={pageSize}
      consultantSearch={consultantSearch ?? ''}
    />
  );
}
