import { API_PROBLEM_TYPES } from '@erp/contracts';
import { daysOf, isoDateInFirmTimeZone, periodFromIso } from '@erp/platform';
import { workingCalendar } from '@erp/timesheet';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { issueInvoice } from '../chain/issue-invoice.ts';
import { recordMonth } from '../chain/record-month.ts';
import { validateCraAndDraftInvoices } from '../chain/validate-cra.ts';
import { craGridComposition } from '../composition/cra-grid.ts';
import {
  type Blocking,
  type CraRow,
  preFacturierComposition,
} from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { consultantEconomics } from '../economics/consultant-economics.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

/**
 * `/api/v1`. Versioned from the first route, because a path that starts unversioned cannot be
 * versioned later without breaking every caller that learned it.
 *
 * **OpenAPI is deliberately not generated.** There is no third-party consumer: the only clients
 * are this repository's tests and the server-rendered screens of Phase 6, both of which live in
 * the same repository as the routes and are typechecked against the same types. A generated
 * document would be a second description of the same thing, kept in step by nobody. The threshold
 * is the first consumer outside this repository.
 *
 * Zod is at the boundary and nowhere else (ADR-0042): these schemas answer "is this a request",
 * never "is this allowed" or "is this consistent". A period that is well-formed and closed is a
 * 400 here and a 409 from the domain, and only one of the two checks may exist.
 */

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const CONFLICT = 409;

/**
 * The cap is here **and** in the repository. Not duplication of a rule: the repository's
 * `Math.min` silently narrows, which is right for a caller that asked for too much by accident;
 * the route refuses, which is right for a caller probing for a "show all". Together they mean
 * there is no page size that returns more than fifty rows, however it is reached.
 */
const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

const PeriodQuery = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });

const IdParam = z.object({ id: z.string().min(1).max(64) });
const ConsultantParams = z.object({ consultantId: z.string().min(1).max(64) });

/**
 * The month, as a body. One entry per **half-day slot** (ADR-0012 makes the half-day the unit, and
 * ADR-0050 makes the whole month the unit of write), so a day split across two missions is two
 * entries and needs no special case.
 *
 * The cap is 62 — the longest month, twice — so a body longer than it is not a month however it is
 * spelled. It is enforced here and, on the web path, by the domain instead: `DayOverbookedError`
 * refuses a third half-day on a day, which is the same bound reached by the rule rather than by the
 * schema.
 */
const MAX_ENTRIES = 62;

const MonthEntries = z.object({
  submit: z.boolean().default(false),
  entries: z
    .array(
      z.object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        dayType: z.union([z.literal('worked'), z.literal('absence')]),
        missionId: z.string().min(1).max(64).nullable().default(null),
      }),
    )
    .max(MAX_ENTRIES),
});

const PeriodParam = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IdempotencyKey = z.string().min(8).max(200);

function notFound(
  request: FastifyRequest,
  what: string,
): ReturnType<typeof contextOf> & {
  type: string;
  title: string;
  status: number;
  detail: string;
} {
  return {
    type: API_PROBLEM_TYPES.notFound,
    title: `No such ${what}`,
    status: NOT_FOUND,
    detail: `This ${what} does not exist, or has never existed.`,
    ...contextOf(request),
  };
}

/** Every day of the month, workable or not — the calendar half of front-end plan Phase 5.2's grid read. */
function gridDaysSkeleton(periodIso: string): { date: string; nonWorkable: string | null }[] {
  const calendar = workingCalendar();

  return daysOf(periodFromIso(periodIso)).map((date) => ({
    date,
    nonWorkable: calendar.nonWorkableReason(date),
  }));
}

/**
 * The declared-reason half of a Cra row's `blocking` (ADR-0037): a `notValidated` block already
 * has its own field on the row (`status`, `late`), so it is not repeated here as a string nobody
 * would parse back into those two facts — only a validated Cra's typed decline reasons are.
 */
function blockingReasonsOf(row: CraRow): string[] {
  return row.blocking
    .filter(
      (item): item is { halfDays: number; why: Extract<Blocking, { kind: 'declined' }> } =>
        item.why.kind === 'declined',
    )
    .map((item) => item.why.reason);
}

export function registerApiRoutes(app: FastifyInstance, dependencies: ServerDependencies): void {
  // ── Reads ─────────────────────────────────────────────────────────────────

  app.get(
    '/api/v1/cras',
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(Pagination, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);

      // Filtered, not refused: a consultant sees their own months, a manager the office's. The
      // empty state is ADR-0003's first beat and it is what this route can answer.
      return dependencies.transactionally(async (unit) => ({
        cras: await unit.cras.list({ actor, limit: query.value.limit, offset: query.value.offset }),
      }));
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

      return {
        id: cra.id,
        consultantId: cra.consultantId,
        officeId: cra.officeId,
        period: `${String(cra.period.year)}-${String(cra.period.month).padStart(2, '0')}`,
        status: cra.status,
        lines: cra.lines,
        flags: cra.flags,
        validatedBy: cra.validatedBy,
      };
    },
  );

  app.get(
    '/api/v1/invoices',
    { config: { access: forRoles('manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(Pagination, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);

      return dependencies.transactionally(async (unit) => ({
        invoices: await unit.invoices.list({
          actor,
          limit: query.value.limit,
          offset: query.value.offset,
        }),
      }));
    },
  );

  app.get(
    '/api/v1/invoices/:id',
    { config: { access: forRoles('manager', 'billing') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);
      const invoice = await dependencies.transactionally((unit) =>
        unit.invoices.findById(params.value.id, actor),
      );
      if (invoice === null) return sendProblem(reply, notFound(request, 'invoice'));

      return {
        id: invoice.id,
        status: invoice.status,
        supplyPeriod: invoice.supplyPeriod,
        invoiceNumber: invoice.number,
        issueDate: invoice.issueDate,
        billedTo: invoice.billedTo,
        seller: invoice.seller,
        terms: invoice.terms,
        mentions: invoice.mentions,
        lines: invoice.lines,
        vatBreakdown: invoice.vatBreakdown,
        totals: invoice.status === 'issued' ? invoice.totals : null,
      };
    },
  );

  // ── The progressive-disclosure read (BUILD-PLAN 5.3, ADR-0043) ────────────

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
      const query = parseInput(PeriodQuery, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);
      const today = isoDateInFirmTimeZone(dependencies.clock.now());

      // The same composition the pré-facturier screen renders (ADR-0053, ADR-0065): the numbers on
      // this JSON payload and the numbers on `GET /pre-facturier` come from one function, so they
      // cannot answer a different question for the same period.
      const composition = await dependencies.transactionally((unit) =>
        preFacturierComposition(unit, { actor, requestedPeriod: query.value.period, today }),
      );

      return {
        period: composition.period,
        summary: {
          billableCents: composition.billable.reduce(
            (total, row) => total + row.totalExcludingVatCents,
            0,
          ),
          // Half-days, despite the name Annexe A pins for this field — the unit every quantity
          // on the wire uses, and what `frenchDays` (both copies) takes as its argument. A
          // consumer that divides by two before formatting prints half the truth.
          lateDays: composition.lateHalfDays,
          craCount: composition.cras.length,
        },
        invoices: composition.invoices,
        cras: composition.cras.map((row) => ({
          craId: row.craId,
          consultantId: row.consultantId,
          consultantName: row.consultantName,
          status: row.status,
          late: composition.periodClosed && row.status !== 'validated',
          recordedHalfDays: row.recordedHalfDays,
          blockingReasons: blockingReasonsOf(row),
          decidable: composition.mayDecide && row.status === 'submitted',
        })),
      };
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
        craGridComposition(unit, { actor, period: periodFromIso(params.value.period) }),
      );

      return {
        period: params.value.period,
        craId: grid.craId,
        status: grid.status,
        days: gridDaysSkeleton(params.value.period),
        missions: grid.missions.map((mission) => ({
          missionId: mission.id,
          name: mission.name,
          clientName: mission.clientName,
        })),
        lines: grid.lines,
        flags: grid.flags,
        refusal: grid.refusal,
        editable: grid.editable,
      };
    },
  );

  // ── The dashboard (front-end plan Phase 5.3) ───────────────────────────────

  /**
   * Honest, role-scoped aggregates — every field computed from a repository this file already
   * calls elsewhere, none invented for this route (front-end plan Phase 5.3's own instruction). The response
   * carries only the fields of the caller's own role: a manager's payload has no consultant-only
   * key sitting at `null`, and neither branch can carry `Cjm`, `Tjm` or a margin field, because
   * neither branch ever reads one.
   */
  app.get(
    '/api/v1/dashboard',
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(PeriodQuery, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);
      const period = periodFromIso(query.value.period);

      if (actor.role === 'consultant') {
        const calendar = workingCalendar();
        const workableDays = daysOf(period).filter(
          (day) => calendar.nonWorkableReason(day) === null,
        );

        const cra = await dependencies.transactionally((unit) =>
          unit.cras.findByConsultantAndPeriod(actor.consultantId, period, actor),
        );

        const recordedByDay = new Map<string, number>();
        for (const line of cra?.lines ?? []) {
          recordedByDay.set(line.day, (recordedByDay.get(line.day) ?? 0) + line.halfDays);
        }
        const HALF_DAYS_PER_FULL_DAY = 2;

        return {
          period: query.value.period,
          role: 'consultant' as const,
          myMonthStatus: cra?.status ?? null,
          recordedHalfDays: cra?.lines.reduce((total, line) => total + line.halfDays, 0) ?? 0,
          // A day short of its two half-days still counts as not entered — a day recorded once is
          // not a day recorded.
          remainingWorkableDays: workableDays.filter(
            (day) => (recordedByDay.get(day) ?? 0) < HALF_DAYS_PER_FULL_DAY,
          ).length,
        };
      }

      if (actor.role === 'manager') {
        const today = isoDateInFirmTimeZone(dependencies.clock.now());
        // The same composition `GET /api/v1/pre-facturier` answers from (ADR-0053, ADR-0065): the
        // dashboard's three manager figures are read off it rather than recomputed, so they cannot
        // disagree with the screen that already shows them in full. That also means this branch
        // inherits ADR-0053's own fifty-row cap on the office's Cras for the period — its
        // reconsideration threshold ("reopen when the office page exceeds the cap") is the one that
        // governs here too, not a second one for the dashboard.
        const composition = await dependencies.transactionally((unit) =>
          preFacturierComposition(unit, { actor, requestedPeriod: query.value.period, today }),
        );

        return {
          period: query.value.period,
          role: 'manager' as const,
          pendingDecisions: composition.cras.filter((row) => row.status === 'submitted').length,
          billableCents: composition.billable.reduce(
            (total, row) => total + row.totalExcludingVatCents,
            0,
          ),
          lateCras: composition.cras.filter(
            (row) => composition.periodClosed && row.status !== 'validated',
          ).length,
        };
      }

      // One page of the office's invoices for the month, not a `COUNT(*)`: the three figures
      // below are bounded by `MAX_PAGE_SIZE`, the cap every list read in this file shares. The
      // seed reaches three invoices in a month; an office that reached fifty-one would read the
      // fifty-first as absent, and the fix then is a counting query, not a larger page.
      const invoices = await dependencies.transactionally((unit) =>
        unit.invoices.list({ actor, limit: MAX_PAGE_SIZE, offset: 0, period: query.value.period }),
      );

      return {
        period: query.value.period,
        role: 'billing' as const,
        draftInvoices: invoices.filter((invoice) => invoice.status === 'draft').length,
        issuedInvoices: invoices.filter((invoice) => invoice.status === 'issued').length,
        totalTtcIssuedCents: invoices
          .filter((invoice) => invoice.status === 'issued')
          .reduce((total, invoice) => total + (invoice.totalTtcCents ?? 0), 0),
      };
    },
  );

  // ── Writes ────────────────────────────────────────────────────────────────

  /**
   * Replaces the month, and submits it if asked (ADR-0050). `PUT` and not `POST`: sending the same
   * body twice leaves the same month, which is what `PUT` means and what a form resubmission does.
   *
   * The path names the **period**, never a consultant: the consultant is the actor. There is no
   * "someone else's month" to reach, so there is no check here that could be forgotten.
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

      return reply.code(200).send(outcome);
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
      return reply.code(200).send({
        craId: outcome.craId,
        replayed: outcome.kind === 'replayed',
        invoices: outcome.invoices,
        declined: outcome.declined,
      });
    },
  );

  app.post(
    '/api/v1/invoices/:id/issuance',
    { config: { access: forRoles('billing') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      // Required, not optional. This is the one POST that allocates a number from a gapless
      // series, and a retry without a key burns a second one (ADR-0044).
      const key = parseInput(IdempotencyKey, request.headers[IDEMPOTENCY_KEY_HEADER]);
      if (!key.ok) {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.idempotencyKeyRequired,
          title: 'Idempotency-Key required',
          status: BAD_REQUEST,
          detail:
            'This request allocates an invoice number from a gapless series. Send a stable ' +
            'Idempotency-Key of 8 to 200 characters, and reuse it if you retry.',
          ...contextOf(request),
        });
      }

      const outcome = await issueInvoice(
        { transactionally: dependencies.transactionally, clock: dependencies.clock },
        {
          invoiceId: params.value.id,
          actor: requireActor(request),
          idempotencyKey: key.value,
        },
      );

      if (outcome.kind === 'notFound') return sendProblem(reply, notFound(request, 'invoice'));

      if (outcome.kind === 'keyReused') {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.idempotencyKeyReused,
          title: 'Idempotency-Key already used on another invoice',
          status: CONFLICT,
          invariant: API_PROBLEM_TYPES.idempotencyKeyReused,
          detail:
            'This Idempotency-Key issued a different invoice. A retry must carry the key of the ' +
            'request it retries; a new issuance needs a new key.',
          ...contextOf(request),
        });
      }

      return reply.code(200).send({
        invoiceId: outcome.invoiceId,
        replayed: outcome.kind === 'replayed',
        invoiceNumber: outcome.invoiceNumber,
        issueDate: outcome.issueDate,
        totalTtcCents: outcome.totalTtcCents,
      });
    },
  );
}
