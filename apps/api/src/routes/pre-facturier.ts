import type { DeclineReason } from '@erp/billing';
import type { PreFacturierResponse } from '@erp/contracts';
import { isoDateInFirmTimeZone } from '@erp/platform';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Blocking, CraRow } from '../composition/pre-facturier.ts';
import { preFacturierComposition } from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PeriodQuery } from './schemas.ts';

const PreFacturierParams = PeriodQuery.extend({
  craLimit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  craOffset: z.coerce.number().int().min(0).default(0),
  invoiceLimit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  invoiceOffset: z.coerce.number().int().min(0).default(0),
  consultantSearch: z.string().trim().min(1).max(100).optional(),
});

/**
 * The declared-reason half of a Cra row's `blocking` (ADR-0037): a `notValidated` block already
 * has its own field on the row (`status`, `late`), so it is not repeated here as a string nobody
 * would parse back into those two facts — only a validated Cra's typed decline reasons are.
 * Package 14: moved here from `cra.ts`, its one real consumer — `cra.ts` itself never called it.
 */
function blockingReasonsOf(row: CraRow): readonly DeclineReason[] {
  return row.blocking
    .filter(
      (item): item is { quarterDays: number; why: Extract<Blocking, { kind: 'declined' }> } =>
        item.why.kind === 'declined',
    )
    .map((item) => item.why.reason);
}

export function registerPreFacturierRoutes(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  app.get(
    '/api/v1/pre-facturier',
    { config: { access: forRoles('manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(PreFacturierParams, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);
      const today = isoDateInFirmTimeZone(dependencies.clock.now());

      // The same composition the pré-facturier screen renders (ADR-0053, ADR-0065): the numbers on
      // this JSON payload and the numbers on `GET /pre-facturier` come from one function, so they
      // cannot answer a different question for the same period.
      const composition = await dependencies.transactionally((unit) =>
        preFacturierComposition(unit, {
          actor,
          requestedPeriod: query.value.period,
          today,
          craLimit: query.value.craLimit,
          craOffset: query.value.craOffset,
          invoiceLimit: query.value.invoiceLimit,
          invoiceOffset: query.value.invoiceOffset,
          ...(query.value.consultantSearch === undefined
            ? {}
            : { consultantSearch: query.value.consultantSearch }),
        }),
      );

      const preFacturierResponse: PreFacturierResponse = {
        period: composition.period,
        offeredPeriods: composition.offeredPeriods,
        summary: {
          billableCents: composition.billable.reduce(
            (total, row) => total + row.totalExcludingVatCents,
            0,
          ),
          // Package 09, sub-step 4/4: named to match its own unit (quarter-days, what
          // `frenchDays` takes directly) rather than the old `lateDays`, which Annexe A pinned
          // and never matched what the field actually carried.
          lateQuarterDays: composition.lateQuarterDays,
          craCount: composition.pagination.cras.total,
        },
        invoices: composition.invoices,
        cras: composition.cras.map((row) => ({
          craId: row.craId,
          consultantId: row.consultantId,
          consultantName: row.consultantName,
          status: row.status,
          late: composition.periodClosed && row.status !== 'validated',
          recordedQuarterDays: row.recordedQuarterDays,
          blockingReasons: blockingReasonsOf(row),
          decidable: composition.mayDecide && row.status === 'submitted',
        })),
        pagination: composition.pagination,
      };
      return preFacturierResponse;
    },
  );
}
