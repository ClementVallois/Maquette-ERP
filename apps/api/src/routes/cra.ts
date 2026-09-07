import type { DeclineReason } from '@erp/billing';
import type {
  CraDetail,
  CraGridResponse,
  CraListResponse,
  GridDay,
  ManagerCraGridResponse,
  MonthEntriesResponse,
  RefusalResponse,
  ValidationResponse,
} from '@erp/contracts';
import { daysOf, periodFromIso } from '@erp/platform';
import { workingCalendar } from '@erp/timesheet';
import type { FastifyInstance } from 'fastify';

import { recordMonth } from '../chain/record-month.ts';
import { refuseCra } from '../chain/refuse-cra.ts';
import { validateCraAndDraftInvoices } from '../chain/validate-cra.ts';
import { type CraGridComposition, craGridComposition } from '../composition/cra-grid.ts';
import type { Blocking, CraRow } from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { ApiFailure } from '../errors.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

import {
  ConsultantPeriodParams,
  CraListParams,
  IdParam,
  MonthEntries,
  notFound,
  PeriodParam,
  RefusalBody,
} from './schemas.ts';

/**
 * `CraLine.quarterDays` (`@erp/timesheet`) is `QuarterDays` (`number`) — deliberately: it is the
 * same type an aggregate month total carries, and a total is not bounded to four. A single line's
 * own domain constructor (`craLine`, `packages/timesheet/src/domain/cra-line.ts`) enforces one to
 * four at construction, but nothing in `QuarterDays` itself can say so — unlike `CraStatus`/
 * `InvoiceStatus` below, this is not a repository leaking a narrower type back to `string`; it is
 * one genuinely wider type reused in two contexts. Package 14's own audit named this cast as one
 * of five to reconsider: `craRowStatus`, `invoiceRowStatus`, `craActivityStatus` and
 * `invoiceActivityStatus` all turned out to be dead (deleted here and in `dashboard.ts`/
 * `invoices.ts`/`pre-facturier.ts` — `CraListItem.status`/`InvoiceListItem.status`/
 * `InvoiceYearStatusCount.status` now carry their real domain union, narrowed once at the
 * PostgreSQL row mapper that is the actual source of the widening). This one stays: narrowing it
 * would need a distinct `1 | 2 | 3 | 4` type split off from the aggregate `QuarterDays`, which is
 * a real domain-modelling decision, not a call-site cleanup — out of this package's scope.
 */
function craLineQuarterDays(quarterDays: number): 1 | 2 | 3 | 4 {
  return quarterDays as 1 | 2 | 3 | 4;
}

/** Every day of the month, workable or not — the calendar half of front-end plan Phase 5.2's grid read. */
function gridDaysSkeleton(periodIso: string): GridDay[] {
  const calendar = workingCalendar();

  return daysOf(periodFromIso(periodIso)).map((date) => ({
    date,
    nonWorkable: calendar.nonWorkableReason(date),
  }));
}

/**
 * The wire shape both grid routes answer (ADR-0071) — `consultantId`/`consultantName` are added on
 * top of this by the manager route only, since the consultant route's caller already knows who
 * they are and Annexe A never named those two fields on the existing endpoint.
 */
function gridResponseOf(period: string, grid: CraGridComposition): CraGridResponse {
  const timeline = [];
  if (grid.submittedAt !== null) {
    timeline.push({
      kind: 'submitted' as const,
      at: grid.submittedAt,
      actorName: grid.consultantName,
    });
  }
  if (grid.refusal !== null) {
    timeline.push({
      kind: 'refused' as const,
      at: grid.refusal.at,
      actorName: grid.refusal.by,
      detail: grid.refusal.reason,
    });
  }
  if (grid.validatedAt !== null && grid.validatedBy !== null) {
    timeline.push({
      kind: 'validated' as const,
      at: grid.validatedAt,
      actorName: grid.validatedBy,
    });
  }

  return {
    period,
    craId: grid.craId,
    status: grid.status,
    days: gridDaysSkeleton(period),
    missions: grid.missions.map((mission) => ({
      missionId: mission.id,
      name: mission.name,
      clientName: mission.clientName,
      assignableDays: mission.assignableDays,
    })),
    lines: grid.lines.map((line) => ({
      ...line,
      quarterDays: craLineQuarterDays(line.quarterDays),
    })),
    flags: grid.flags,
    refusal: grid.refusal,
    editable: grid.editable,
    validatedBy: grid.validatedBy,
    timeline,
  };
}

/**
 * The declared-reason half of a Cra row's `blocking` (ADR-0037): a `notValidated` block already
 * has its own field on the row (`status`, `late`), so it is not repeated here as a string nobody
 * would parse back into those two facts — only a validated Cra's typed decline reasons are.
 */
export function blockingReasonsOf(row: CraRow): readonly DeclineReason[] {
  return row.blocking
    .filter(
      (item): item is { quarterDays: number; why: Extract<Blocking, { kind: 'declined' }> } =>
        item.why.kind === 'declined',
    )
    .map((item) => item.why.reason);
}

export function registerCraRoutes(app: FastifyInstance, dependencies: ServerDependencies): void {
  app.get(
    '/api/v1/cras',
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(CraListParams, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);

      // Filtered, not refused: a consultant sees their own months, a manager the office's. The
      // empty state is ADR-0003's first beat and it is what this route can answer.
      // `consultantIds`/`statuses` (item 7, QA round 1) narrow within that same filtering — never
      // widen it, the repository's own contract (`CraListQuery`'s header, `packages/timesheet`).
      return dependencies.transactionally(async (unit) => {
        const filters = {
          actor,
          // `exactOptionalPropertyTypes` refuses an explicit `undefined` — omitted, not passed,
          // when the query carried no filter on that dimension.
          ...(query.value.consultantIds === undefined
            ? {}
            : { consultantIds: query.value.consultantIds }),
          ...(query.value.statuses === undefined ? {} : { statuses: query.value.statuses }),
          ...(query.value.year === undefined ? {} : { year: query.value.year }),
          ...(query.value.month === undefined ? {} : { month: query.value.month }),
          ...(query.value.beforePeriod === undefined
            ? {}
            : { beforePeriod: query.value.beforePeriod }),
        };
        const cras = await unit.cras.list({
          ...filters,
          limit: query.value.limit,
          offset: query.value.offset,
        });
        const total = await unit.cras.count(filters);

        // `consultantName`, presentation rather than a rule — the same source and the same
        // justification `preFacturierComposition` already uses (ADR-0071): a manager's row needs a
        // name to pick a consultant by, and a consultant's own rows just get their own name back.
        const consultantNames = await new PgReferenceReader(unit.client).consultantNames();

        const craListResponse: CraListResponse = {
          cras: cras.map((cra) => ({
            ...cra,
            status: cra.status,
            consultantName: consultantNames.get(cra.consultantId) ?? cra.consultantId,
          })),
          total,
          limit: query.value.limit,
          offset: query.value.offset,
        };
        return craListResponse;
      });
    },
  );
  app.get(
    '/api/v1/cras/:id',
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);

      // A Cra in another office raises `OutOfScopeError` from the repository, which the error
      // handler answers as a 403 naming the rule — ADR-0003's second beat. A Cra that does not
      // exist is `null`, and that is a 404. The two are different facts and answer differently.
      const cra = await dependencies.transactionally((unit) =>
        unit.cras.findById(params.value.id, actor),
      );
      if (cra === null) return sendProblem(reply, notFound(request, 'Cra'));

      const craDetail: CraDetail = {
        id: cra.id,
        consultantId: cra.consultantId,
        officeId: cra.officeId,
        period: `${String(cra.period.year)}-${String(cra.period.month).padStart(2, '0')}`,
        status: cra.status,
        lines: cra.lines.map((line) => ({
          ...line,
          quarterDays: craLineQuarterDays(line.quarterDays),
        })),
        flags: cra.flags,
        validatedBy: cra.validatedBy,
      };
      return craDetail;
    },
  );

  app.get(
    '/api/v1/cras/:period/grid',
    { config: { access: forRoles('consultant') } },
    async (request, reply) => {
      const params = parseInput(PeriodParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);

      const grid = await dependencies.transactionally((unit) =>
        craGridComposition(unit, {
          actor,
          period: periodFromIso(params.value.period),
          consultantId: actor.consultantId,
        }),
      );
      // A persona is always its own row in `public.consultants` — this route never asks about
      // anyone else, so `null` (no such consultant) cannot happen here. Guarded rather than
      // asserted with `!`, so a broken fixture fails loudly instead of reading `undefined`.
      if (grid === null) {
        throw new ApiFailure(`persona ${actor.consultantId} has no consultant record`);
      }

      return gridResponseOf(params.value.period, grid);
    },
  );

  /**
   * ADR-0071: a manager reads a **named** consultant's grid, read-only. Same composition as the
   * route above, the same 404-vs-403 split as every other single-record read in this file
   * (ADR-0003) — a `consultantId` matching nobody is a 404, one matching a consultant of another
   * office is a 403 `out-of-scope`, raised by `assertMayRead` inside `craGridComposition` itself.
   */
  app.get(
    '/api/v1/consultants/:consultantId/cras/:period/grid',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(ConsultantPeriodParams, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);

      const grid = await dependencies.transactionally((unit) =>
        craGridComposition(unit, {
          actor,
          period: periodFromIso(params.value.period),
          consultantId: params.value.consultantId,
        }),
      );
      if (grid === null) return sendProblem(reply, notFound(request, 'consultant'));

      const managerCraGridResponse: ManagerCraGridResponse = {
        ...gridResponseOf(params.value.period, grid),
        consultantId: grid.consultantId,
        consultantName: grid.consultantName,
      };
      return managerCraGridResponse;
    },
  );

  /**
   * Replace the actor's month, submitting it in the same idempotent `PUT` when requested. The path
   * names no consultant because the authenticated actor is always the owner of this write.
   */
  app.put(
    '/api/v1/cras/:period/entries',
    { config: { access: forRoles('consultant') } },
    async (request, reply) => {
      const params = parseInput(PeriodParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const body = parseInput(MonthEntries, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const outcome = await recordMonth(
        {
          transactionally: dependencies.transactionally,
          clock: dependencies.clock,
          newId: dependencies.newId,
        },
        {
          actor: requireActor(request),
          period: periodFromIso(params.value.period),
          entries: body.value.entries,
          submit: body.value.submit,
        },
      );

      const monthEntriesResponse: MonthEntriesResponse = {
        craId: outcome.craId,
        status: outcome.status,
        flags: outcome.flags,
      };
      return reply.code(200).send(monthEntriesResponse);
    },
  );

  app.post(
    '/api/v1/cras/:id/validation',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const outcome = await validateCraAndDraftInvoices(
        {
          transactionally: dependencies.transactionally,
          clock: dependencies.clock,
          newId: dependencies.newId,
        },
        {
          craId: params.value.id,
          actor: requireActor(request),
          // The chain's correlation id IS the request's, so the `domain_events` row and the log
          // line of the request that caused it carry the same value (ADR-0020, ADR-0024).
          correlationId: request.id,
        },
      );

      if (outcome.kind === 'notFound') return sendProblem(reply, notFound(request, 'Cra'));

      // A replay is 200, not 409: ADR-0021's contract is "original result, not rejection".
      const validationResponse: ValidationResponse = {
        craId: outcome.craId,
        replayed: outcome.kind === 'replayed',
        invoices: outcome.invoices.map((invoice) => ({
          ...invoice,
          status: invoice.status,
        })),
        declined: outcome.declined,
      };
      return reply.code(200).send(validationResponse);
    },
  );

  app.post(
    '/api/v1/cras/:id/refusal',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const body = parseInput(RefusalBody, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      // The symmetric twin of `/validation` above: same `findById` scoping (a Cra outside the
      // manager's office throws `OutOfScopeError`, caught by the global handler as ADR-0003's
      // second beat), same `notFound` shape for one that does not exist at all. Every other
      // refusal — wrong status, blank reason after trim, wrong manager — is the domain's own
      // typed error, thrown by `cra.refuse()` and mapped by `problemFromBusinessError`.
      const outcome = await refuseCra(
        { transactionally: dependencies.transactionally, clock: dependencies.clock },
        {
          craId: params.value.id,
          actor: requireActor(request),
          reason: body.value.reason,
        },
      );

      if (outcome.kind === 'notFound') return sendProblem(reply, notFound(request, 'Cra'));

      const refusalResponse: RefusalResponse = { craId: outcome.craId, status: 'refused' };
      return reply.code(200).send(refusalResponse);
    },
  );
}
