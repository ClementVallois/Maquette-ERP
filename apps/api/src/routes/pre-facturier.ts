import type { ConsultantRosterResponse, PreFacturierResponse } from '@erp/contracts';
import { isoDateInFirmTimeZone, periodFromIso } from '@erp/platform';
import { workingCalendar } from '@erp/timesheet';
import type { FastifyInstance } from 'fastify';

import { preFacturierComposition } from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { consultantEconomics } from '../economics/consultant-economics.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

import { blockingReasonsOf } from './cra.ts';
import { ConsultantParams, notFound, PeriodQuery, PreFacturierParams } from './schemas.ts';

export function registerPreFacturierRoutes(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  /**
   * The working calendar's own coverage (ADR-0004: a written table, 2026 only today). Not a Cra
   * read at all — it exists so `/cra`'s month picker can offer exactly the months
   * `workingCalendar()` can answer about, instead of a hard-coded upper bound the calendar itself
   * would silently outgrow. Every connected role may ask; the answer carries nothing scoped to an
   * office or a consultant.
   */
  app.get(
    '/api/v1/calendar',
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    () => ({ years: workingCalendar().years }),
  );

  /**
   * Item 7 (QA round 1): the consultant filter's own option list, independent of `/api/v1/cras`'
   * page — a manager's office can hold more Cra rows than one page (item 6 grows a roster past
   * fifty), so deriving "who can I filter by" from whichever page happens to be loaded would make
   * the picker's own options depend on which filter is already applied. Manager only, matching
   * the one caller (`features/cra/components/cra-list-screen.tsx`'s `CraListFilters`, manager-only
   * itself): billing sees `/api/v1/cras` too, but that screen renders neither a consultant column
   * nor an "Ouvrir" action for that role, so this filter has nothing on screen for billing to
   * narrow down yet — granting the read anyway would be capability nothing exercises.
   */
  app.get('/api/v1/consultants', { config: { access: forRoles('manager') } }, async (request) => {
    const actor = requireActor(request);

    return dependencies.transactionally(async (unit) => {
      const rosterResponse: ConsultantRosterResponse = {
        consultants: await new PgReferenceReader(unit.client).consultantsOfOffice(actor.officeId),
      };
      return rosterResponse;
    });
  });
  app.get(
    '/api/v1/consultants/:consultantId/economics',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(ConsultantParams, request.params);
      const query = parseInput(PeriodQuery, request.query);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);
      // The disclosure log lives inside `consultantEconomics` (ADR-0052), not here: this route and
      // the `/marge` screen serve the same record, and a control written once per handler is a
      // control the second handler forgets.
      const economics = await dependencies.transactionally((unit) =>
        consultantEconomics(
          { client: unit.client, cras: unit.cras, log: request.log },
          {
            consultantId: params.value.consultantId,
            period: periodFromIso(query.value.period),
            actor,
          },
        ),
      );

      if (economics === null) return sendProblem(reply, notFound(request, 'economics record'));

      return economics;
    },
  );

  // ── The pré-facturier, and the Cra grid (front-end plan Phase 5.1 and 5.2) ─

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
        invoices: composition.invoices.map((row) => ({
          ...row,
          status: row.status,
        })),
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
