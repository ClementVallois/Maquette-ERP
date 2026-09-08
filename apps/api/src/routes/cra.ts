import type {
  ConsultantRosterResponse,
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
import { CRA_STATUSES, workingCalendar } from '@erp/timesheet';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { recordMonth } from '../chain/record-month.ts';
import { refuseCra } from '../chain/refuse-cra.ts';
import { validateCraAndDraftInvoices } from '../chain/validate-cra.ts';
import { type CraGridComposition, craGridComposition } from '../composition/cra-grid.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { ApiFailure } from '../errors.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

import {
  CRA_LIST_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  IdParam,
  notFound,
  Pagination,
  YearQuery,
} from './schemas.ts';

/**
 * A single query-string value, comma-separated, rather than a repeated key
 * (`?consultantIds=a&consultantIds=b`) — Fastify's default querystring parser only produces an
 * array from a repeated key, and a *single* selection would otherwise arrive as a bare string,
 * needing a second branch here to tell "one" from "many" apart. Comma-separated needs none: an
 * absent param stays `undefined` ("every value", the domain's own `CraListQuery` reading), and
 * empty segments are dropped so a trailing comma or `?consultantIds=` cannot smuggle in `''` as
 * an id. Two concrete schemas rather than one generic helper: Zod v4's `.pipe()` cannot carry a
 * type parameter through cleanly (`input<Item>` does not narrow to `string` for an unconstrained
 * `Item`), and two short schemas cost less than fighting that for two call sites.
 */
const CommaSeparatedIds = z
  .string()
  .optional()
  .transform((value) => value?.split(',').filter((entry) => entry.length > 0))
  .pipe(z.array(z.string().min(1).max(64)).optional());

const CommaSeparatedStatuses = z
  .string()
  .optional()
  .transform((value) => value?.split(',').filter((entry) => entry.length > 0))
  .pipe(z.array(z.enum(CRA_STATUSES)).optional());

/**
 * The month half of the year/month filter. `YearQuery` (`./schemas.ts`) is shared with
 * `invoices.ts`; this half has only this one consumer.
 */
const MonthQuery = z.coerce.number().int().min(1).max(12).optional();

/**
 * "For these three consultants, every CRA not yet validated" — both dimensions, non-exclusive
 * within themselves (an id/status list is an OR) and ANDed with each other, pushed to the domain's
 * `CraListQuery` (`packages/timesheet`) so a large office roster filters server-side rather than
 * over a page `limit`/`offset` truncated first.
 */
const CraListParams = Pagination.extend({
  // `limit` overrides the base schema's field, at `CRA_LIST_MAX_PAGE_SIZE` rather than
  // `MAX_PAGE_SIZE` — this route's own cap, ADR-0081.
  limit: z.coerce.number().int().min(1).max(CRA_LIST_MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  // No exact `period`: unlike `/api/v1/pre-facturier`, this route does not take one — the CRA
  // list shows every period at once, with its own `period` column. `year`/`month` below narrow
  // *within* that always-every-period list; they do not add a single-period mode.
  consultantIds: CommaSeparatedIds,
  statuses: CommaSeparatedStatuses,
  year: YearQuery,
  month: MonthQuery,
  // The dashboard's "CRA en retard" deep link — every period strictly before this one, matching
  // `lateCras`' own `lastDayOf(period) < today` (`CraListQuery`'s doc comment, `packages/timesheet`,
  // has the equivalence).
  beforePeriod: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional(),
});

const PeriodParam = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });
const ConsultantPeriodParams = z.object({
  consultantId: z.string().min(1).max(64),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
});

/**
 * The month, as a body. One entry per **matrix cell** (ADR-0069 makes the quarter-day the unit,
 * ADR-0070 makes one cell one `(day, dayType, missionId)` triplet, and ADR-0050 makes the whole
 * month the unit of write), so a day split across two missions is two entries and needs no special
 * case. Each entry carries its own `quarterDays`, one to four.
 *
 * The cap is 124 — 4 × 31, the longest month at its maximum density — so a body longer than it is
 * not a month however it is spelled. It is enforced here and, on the web path, by the domain
 * instead: `DayOverbookedError` refuses a fifth quarter-day on a day, which is the same bound
 * reached by the rule rather than by the schema.
 */
const MAX_ENTRIES = 124;
const MIN_QUARTER_DAYS = 1;
const MAX_QUARTER_DAYS = 4;

const MonthEntries = z.object({
  submit: z.boolean().default(false),
  entries: z
    .array(
      z.object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        dayType: z.union([z.literal('worked'), z.literal('absence')]),
        missionId: z.string().min(1).max(64).nullable().default(null),
        quarterDays: z.number().int().min(MIN_QUARTER_DAYS).max(MAX_QUARTER_DAYS),
      }),
    )
    .max(MAX_ENTRIES),
});

/**
 * The bound is a schema check — "is this a request" — and it stops short of trimming: a
 * whitespace-only reason of the right length still reaches `refuse()`, whose own
 * `RefusalReasonRequiredError` is the "is this a legitimate refusal" half of ADR-0042.
 */
const RefusalBody = z.object({ reason: z.string().min(1).max(500) });

/**
 * `CraLine.quarterDays` (`@erp/timesheet`) is `QuarterDays` (`number`) — deliberately: it is the
 * same type an aggregate month total carries, and a total is not bounded to four. A single line's
 * own domain constructor (`craLine`, `packages/timesheet/src/domain/cra-line.ts`) enforces one to
 * four at construction, but nothing in `QuarterDays` itself can say so — unlike `CraStatus`/
 * `InvoiceStatus`, this is not a repository leaking a narrower type back to `string`; it is one
 * genuinely wider type reused in two contexts. The status casts this file once needed are gone:
 * `CraListItem.status`, `InvoiceListItem.status` and `InvoiceYearStatusCount.status` carry their
 * real domain union, narrowed once at the PostgreSQL row mapper that is the source of the
 * widening. This one stays: narrowing it
 * would need a distinct `1 | 2 | 3 | 4` type split off from the aggregate `QuarterDays`, which is
 * a real domain-modelling decision, not a call-site cleanup — out of this package's scope.
 */
function craLineQuarterDays(quarterDays: number): 1 | 2 | 3 | 4 {
  return quarterDays as 1 | 2 | 3 | 4;
}

/** Every day of the month, workable or not — the calendar half of the grid read. */
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

export function registerCraRoutes(app: FastifyInstance, dependencies: ServerDependencies): void {
  /**
   * The working calendar's own coverage (ADR-0004: a written table, 2026 only today). Not a Cra
   * read at all — it exists so `/cra`'s month picker can offer exactly the months
   * `workingCalendar()` can answer about, instead of a hard-coded upper bound the calendar itself
   * would silently outgrow. Every connected role may ask; the answer carries nothing scoped to an
   * office or a consultant. It lives here rather than with the pré-facturier because its only
   * consumer is `apps/web/src/lib/calendar.ts`, read by the CRA list and its year filter.
   */
  app.get(
    '/api/v1/calendar',
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    () => ({ years: workingCalendar().years }),
  );

  /**
   * The consultant filter's own option list, independent of `/api/v1/cras`' page — a manager's
   * office holds more Cra rows than one page, so deriving "who can I filter by" from whichever
   * page happens to be loaded would make
   * the picker's own options depend on which filter is already applied. Manager only, matching
   * the one caller (`features/cra/components/cra-list-screen.tsx`'s `CraListFilters`, manager-only
   * itself): billing sees `/api/v1/cras` too, but that screen renders neither a consultant column
   * nor an "Ouvrir" action for that role, so this filter has nothing on screen for billing to
   * narrow down yet — granting the read anyway would be capability nothing exercises. It lives
   * here rather than with the pré-facturier because `features/cra/api.ts` is its only caller.
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
    '/api/v1/cras',
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(CraListParams, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);

      // Filtered, not refused: a consultant sees their own months, a manager the office's. The
      // empty state is ADR-0003's first beat and it is what this route can answer.
      // `consultantIds`/`statuses` narrow within that same filtering — never
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
        invoices: outcome.invoices,
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
