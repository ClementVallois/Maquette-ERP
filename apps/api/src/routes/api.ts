import { INVOICE_STATUSES, vatGroupKey } from '@erp/billing';
import { API_PROBLEM_TYPES } from '@erp/contracts';
import {
  daysOf,
  isoDateInFirmTimeZone,
  lastDayOf,
  periodFromIso,
  QUARTER_DAYS_PER_DAY,
} from '@erp/platform';
import { CRA_STATUSES, workingCalendar } from '@erp/timesheet';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { issueInvoice } from '../chain/issue-invoice.ts';
import { recordMonth } from '../chain/record-month.ts';
import { refuseCra } from '../chain/refuse-cra.ts';
import { validateCraAndDraftInvoices } from '../chain/validate-cra.ts';
import { type CraGridComposition, craGridComposition } from '../composition/cra-grid.ts';
import {
  type Blocking,
  type CraRow,
  preFacturierComposition,
} from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { consultantEconomics } from '../economics/consultant-economics.ts';
import { ApiFailure } from '../errors.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import {
  assignmentCatalogue,
  createAssignment,
  type AssignmentWriteOutcome,
  updateAssignment,
} from '../staffing/assignment-admin.ts';
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
 * there is no page size that returns more than fifty rows, however it is reached — for every
 * list that uses this schema as written. `GET /api/v1/cras` is the one exception
 * (`CRA_LIST_MAX_PAGE_SIZE` below, ADR-0081): it overrides `limit` at a higher, still-fixed cap,
 * measured against a real worst case rather than raised on this shared constant, which would have
 * raised `/api/v1/invoices`'s own cap too, unmeasured.
 */
const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * `GET /api/v1/cras`'s own cap (ADR-0081, item 6/step 3, QA round 1) — deliberately **not**
 * `MAX_PAGE_SIZE` above, which `/api/v1/invoices` and every other list in this file also share:
 * raising the shared constant would have raised theirs too, unmeasured. Item 6's own roster
 * expansion measured a real worst case — Paris, 65 Cras in one office once the dense months and
 * the sparse 2016 history exist (`docs/adr/0080-…`) — and this cap clears it with headroom for
 * organic growth rather than merely matching it. `MAX_PAGE_SIZE` is still the hard ceiling
 * BUILD-RULES asks for ("no 'show all'"): 200 is a fixed number, not `Infinity`, and a caller who
 * asks for more still gets refused by `Pagination`'s own `.max()` shape, reproduced here at a
 * different value.
 */
const CRA_LIST_MAX_PAGE_SIZE = 200;

/**
 * The three months the seed actually fills densely (`CLAUDE.md`'s dataset-shape section) — Rank
 * A2's history chart names them explicitly rather than deriving "the last three months", which
 * would silently start rendering zeros the day the wall clock moves past August 2026.
 */
const DENSE_MONTHS = ['2026-06', '2026-07', '2026-08'] as const;

const PeriodQuery = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });
const PreFacturierParams = PeriodQuery.extend({
  craLimit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  craOffset: z.coerce.number().int().min(0).default(0),
  invoiceLimit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  invoiceOffset: z.coerce.number().int().min(0).default(0),
});

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
 * Item 4 (QA round 2): "a year and/or month filter". Two independent, optional numbers rather
 * than a `period` string — a manager picks a year and a month from two separate dropdowns, not
 * types a `YYYY-MM`, and either one alone has to narrow on its own (every March, any year; every
 * period in 2024, any month). `CraListQuery.year`/`.month` (`packages/timesheet`) carry the same
 * shape through to the repository, which matches each against `period`'s own text directly (that
 * column is `YYYY-MM` text, not a real date type — migration 002's own comment).
 */
const YearQuery = z.coerce.number().int().min(2000).max(2100).optional();
const MonthQuery = z.coerce.number().int().min(1).max(12).optional();

/**
 * Item 7 (QA round 1): "for these three consultants, every CRA not yet validated" — both
 * dimensions, non-exclusive within themselves (an id/status list is an OR) and ANDed with each
 * other, pushed to the domain's `CraListQuery` (`packages/timesheet`) so item 6's larger office
 * rosters filter server-side rather than over a page truncated by `limit`/`offset` first.
 */
const CraListParams = Pagination.extend({
  // `limit` overrides the base schema's field, at `CRA_LIST_MAX_PAGE_SIZE` rather than
  // `MAX_PAGE_SIZE` — this route's own cap, ADR-0081.
  limit: z.coerce.number().int().min(1).max(CRA_LIST_MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  // No exact `period`: unlike `/api/v1/pre-facturier`, this route has never taken one, and item 7
  // did not ask for one either (the CRA list already shows every period at once, with its own
  // `period` column) — `year`/`month` below (item 4, QA round 2) narrow *within* that same
  // always-every-period list, they do not add a single-period mode back.
  consultantIds: CommaSeparatedIds,
  statuses: CommaSeparatedStatuses,
  year: YearQuery,
  month: MonthQuery,
});

const InvoiceListParams = Pagination.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  year: YearQuery,
  search: z.string().trim().min(1).max(100).optional(),
});

const IdParam = z.object({ id: z.string().min(1).max(64) });
const ConsultantParams = z.object({ consultantId: z.string().min(1).max(64) });

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

const PeriodParam = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });
const ConsultantPeriodParams = z.object({
  consultantId: z.string().min(1).max(64),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
});

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IdempotencyKey = z.string().min(8).max(200);

/**
 * The bound is a schema check — "is this a request" — and it stops short of trimming: a
 * whitespace-only reason of the right length still reaches `refuse()`, whose own
 * `RefusalReasonRequiredError` is the "is this a legitimate refusal" half of ADR-0042.
 */
const RefusalBody = z.object({ reason: z.string().min(1).max(500) });
const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const AssignmentBody = z.object({
  consultantId: z.string().min(1).max(64),
  missionId: z.string().min(1).max(64),
  fromDate: IsoDateString,
  toDate: IsoDateString.nullable().default(null),
});

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

function assignmentRefusal(
  request: FastifyRequest,
  outcome: Extract<AssignmentWriteOutcome, { kind: 'refused' }>,
) {
  return {
    type: outcome.problemType,
    title: 'Assignment refused',
    status: CONFLICT,
    invariant: outcome.problemType,
    errors: Object.fromEntries(
      Object.entries(outcome.details).map(([field, value]) => [field, [value]]),
    ),
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
 * The wire shape both grid routes answer (ADR-0071) — `consultantId`/`consultantName` are added on
 * top of this by the manager route only, since the consultant route's caller already knows who
 * they are and Annexe A never named those two fields on the existing endpoint.
 */
function gridResponseOf(
  period: string,
  grid: CraGridComposition,
): {
  period: string;
  craId: string | null;
  status: CraGridComposition['status'];
  days: { date: string; nonWorkable: string | null }[];
  missions: {
    missionId: string;
    name: string;
    clientName: string;
    assignableDays: readonly string[];
  }[];
  lines: CraGridComposition['lines'];
  flags: CraGridComposition['flags'];
  refusal: CraGridComposition['refusal'];
  editable: boolean;
  validatedBy: string | null;
  timeline: {
    kind: 'submitted' | 'refused' | 'validated';
    at: string;
    actorName: string;
    detail?: string;
  }[];
} {
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
    lines: grid.lines,
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
function blockingReasonsOf(row: CraRow): string[] {
  return row.blocking
    .filter(
      (item): item is { quarterDays: number; why: Extract<Blocking, { kind: 'declined' }> } =>
        item.why.kind === 'declined',
    )
    .map((item) => item.why.reason);
}

export function registerApiRoutes(app: FastifyInstance, dependencies: ServerDependencies): void {
  // ── Reads ─────────────────────────────────────────────────────────────────

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

        return {
          cras: cras.map((cra) => ({
            ...cra,
            consultantName: consultantNames.get(cra.consultantId) ?? cra.consultantId,
          })),
          total,
          limit: query.value.limit,
          offset: query.value.offset,
        };
      });
    },
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

    return dependencies.transactionally(async (unit) => ({
      consultants: await new PgReferenceReader(unit.client).consultantsOfOffice(actor.officeId),
    }));
  });

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

  /**
   * Rank A2: the dashboard's history chart. Two honest series and only these two — six real
   * (year, status) points spanning 2016→2026, and the three dense 2026 months' billable HT,
   * labelled as three months and never presented as a trend (a twelve-month curve would render
   * three bars and nine zeros, the same visual lie under a new name).
   */
  app.get(
    '/api/v1/invoices/history',
    { config: { access: forRoles('manager', 'billing') } },
    async (request) => {
      const actor = requireActor(request);

      return dependencies.transactionally(async (unit) => {
        const byYearAndStatus = await unit.invoices.countByYearAndStatus(actor);

        // `preFacturierComposition` already computes a period's billable HT from the live
        // aggregate rather than a stored (and, for a draft, absent) total — reused here rather
        // than reimplemented, for the three months the seed actually fills.
        const today = isoDateInFirmTimeZone(dependencies.clock.now());
        const denseMonths = [];
        for (const period of DENSE_MONTHS) {
          const composition = await preFacturierComposition(unit, {
            actor,
            requestedPeriod: period,
            today,
          });
          denseMonths.push({
            period,
            billableCents: composition.billable.reduce(
              (total, row) => total + row.totalExcludingVatCents,
              0,
            ),
          });
        }

        return { byYearAndStatus, denseMonths };
      });
    },
  );

  app.get(
    '/api/v1/invoices',
    { config: { access: forRoles('manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(InvoiceListParams, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);

      return dependencies.transactionally(async (unit) => {
        const sharedFilters = {
          actor,
          ...(query.value.year === undefined ? {} : { year: query.value.year }),
          ...(query.value.search === undefined ? {} : { search: query.value.search }),
        };
        const filters = {
          ...sharedFilters,
          ...(query.value.status === undefined ? {} : { status: query.value.status }),
        };
        const page = await unit.invoices.list({
          ...filters,
          limit: query.value.limit,
          offset: query.value.offset,
        });
        const total = await unit.invoices.count(filters);
        const statusCounts = {
          all: await unit.invoices.count(sharedFilters),
          draft: await unit.invoices.count({ ...sharedFilters, status: 'draft' }),
          issued: await unit.invoices.count({ ...sharedFilters, status: 'issued' }),
          cancelledByCreditNote: await unit.invoices.count({
            ...sharedFilters,
            status: 'cancelledByCreditNote',
          }),
        };

        const reference = new PgReferenceReader(unit.client);
        const consultantNames = await reference.consultantNames();
        const missionNames = await reference.missionNames();

        // Rank A7: the same discriminant the pré-facturier already carries
        // (`PreFacturierInvoiceRow`) — a draft's client and period alone do not tell two invoices
        // to the same client apart. One more read per row, bounded by the page, plus one Cra
        // lookup per row's single source Cra (`saveDraft` records exactly one). Sequential, not
        // `Promise.all`: every read here shares the one checked-out client this transaction is
        // (`validate-cra.ts`'s own header explains why overlapping them buys nothing).
        const invoices = [];
        for (const item of page) {
          const invoice = await unit.invoices.findById(item.id, actor);
          const sourceCraId = invoice?.lines[0]?.origin.craId;
          const sourceCra =
            sourceCraId === undefined ? null : await unit.cras.findById(sourceCraId, actor);
          const lineMissionIds = [
            ...new Set((invoice?.lines ?? []).map((line) => line.origin.missionId)),
          ];
          const createdAt =
            sourceCra === null
              ? null
              : ((
                  sourceCra.validatedAt ??
                  sourceCra.refusal?.at ??
                  sourceCra.submittedAt
                )?.toISOString() ?? null);

          invoices.push({
            ...item,
            consultantName:
              sourceCra === null
                ? '—'
                : (consultantNames.get(sourceCra.consultantId) ?? sourceCra.consultantId),
            missionNames: lineMissionIds.map((id) => missionNames.get(id) ?? id),
            lineCount: invoice?.lines.length ?? 0,
            createdAt,
          });
        }

        return {
          invoices,
          total,
          limit: query.value.limit,
          offset: query.value.offset,
          statusCounts,
        };
      });
    },
  );

  app.get(
    '/api/v1/invoices/:id',
    { config: { access: forRoles('manager', 'billing') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);
      const detail = await dependencies.transactionally(async (unit) => {
        const invoice = await unit.invoices.findById(params.value.id, actor);
        if (invoice === null) return null;

        const sourceCraId = invoice.lines[0]?.origin.craId;
        const sourceCra =
          sourceCraId === undefined ? null : await unit.cras.findById(sourceCraId, actor);
        const reference = new PgReferenceReader(unit.client);
        const consultantNames = await reference.consultantNames();
        const missionNames = await reference.missionNames();
        return { invoice, sourceCra, consultantNames, missionNames };
      });
      if (detail === null) return sendProblem(reply, notFound(request, 'invoice'));

      const { invoice, sourceCra, consultantNames, missionNames } = detail;
      const timeline = [];
      if (sourceCra?.validatedAt !== null && sourceCra?.validatedAt !== undefined) {
        const validatedBy = sourceCra.validatedBy;
        timeline.push({
          kind: 'validated' as const,
          at: sourceCra.validatedAt.toISOString(),
          actorName:
            validatedBy === null ? null : (consultantNames.get(validatedBy) ?? validatedBy),
        });
        timeline.push({
          kind: 'drafted' as const,
          at: sourceCra.validatedAt.toISOString(),
          actorName: null,
        });
      }
      if (invoice.issueDate !== null) {
        timeline.push({ kind: 'issued' as const, at: invoice.issueDate, actorName: null });
      }

      const lineage = invoice.lines.map((line) => {
        const vatGroup = invoice.vatBreakdown.find((group) => group.key === vatGroupKey(line.vat));

        return {
          craId: line.origin.craId,
          period: line.origin.period,
          missionId: line.origin.missionId,
          missionName: missionNames.get(line.origin.missionId) ?? line.origin.missionId,
          sourceDays:
            sourceCra?.lines
              .filter(
                (sourceLine) =>
                  sourceLine.dayType === 'worked' && sourceLine.missionId === line.origin.missionId,
              )
              .map((sourceLine) => ({
                day: sourceLine.day,
                quarterDays: sourceLine.quarterDays,
              })) ?? [],
          quantityQuarterDays: line.quantityQuarterDays,
          tjmCents: line.origin.tjmCents,
          lineAmountCents: line.amountCents,
          vatGroup: vatGroup ?? null,
          invoiceTotalTtcCents: invoice.totals.totalIncludingVatCents,
        };
      });

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
        // `Invoice.totals` (billing/domain/invoice.ts) computes from the lines when nothing is
        // frozen yet, so a draft's totals are real numbers, not a placeholder — but they are not
        // yet the document's totals, since issuing can still change the lines. `totalsAreProvisional`
        // is what tells the reader that difference; nothing here persists the draft's totals.
        totals: invoice.totals,
        totalsAreProvisional: invoice.status === 'draft',
        timeline,
        lineage,
      };
    },
  );

  app.get('/api/v1/assignments', { config: { access: forRoles('manager') } }, async (request) => {
    const actor = requireActor(request);
    return dependencies.transactionally((unit) => assignmentCatalogue(unit.client, actor));
  });

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
        }),
      );

      return {
        period: composition.period,
        offeredPeriods: composition.offeredPeriods,
        summary: {
          billableCents: composition.billable.reduce(
            (total, row) => total + row.totalExcludingVatCents,
            0,
          ),
          // Quarter-days, despite the name Annexe A pins for this field — the unit every quantity
          // on the wire uses, and what `frenchDays` (both copies) takes as its argument. A
          // consumer that divides by four before formatting prints a quarter of the truth.
          lateDays: composition.lateQuarterDays,
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

      return {
        ...gridResponseOf(params.value.period, grid),
        consultantId: grid.consultantId,
        consultantName: grid.consultantName,
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

        const { cra, allCras } = await dependencies.transactionally(async (unit) => ({
          cra: await unit.cras.findByConsultantAndPeriod(actor.consultantId, period, actor),
          allCras: await unit.cras.list({
            actor,
            limit: CRA_LIST_MAX_PAGE_SIZE,
            offset: 0,
          }),
        }));

        const recordedByDay = new Map<string, number>();
        for (const line of cra?.lines ?? []) {
          recordedByDay.set(line.day, (recordedByDay.get(line.day) ?? 0) + line.quarterDays);
        }

        return {
          period: query.value.period,
          role: 'consultant' as const,
          myMonthStatus: cra?.status ?? null,
          recordedQuarterDays: cra?.lines.reduce((total, line) => total + line.quarterDays, 0) ?? 0,
          // A day short of its four quarter-days still counts as not entered — a day recorded
          // once is not a day recorded.
          remainingWorkableDays: workableDays.filter(
            (day) => (recordedByDay.get(day) ?? 0) < QUARTER_DAYS_PER_DAY,
          ).length,
          refusedPeriods: allCras
            .filter((row) => row.status === 'refused')
            .map((row) => row.period),
          recentActivity: allCras
            .filter(
              (row): row is typeof row & { statusChangedAt: string } =>
                row.statusChangedAt !== null,
            )
            .toSorted((left, right) => right.statusChangedAt.localeCompare(left.statusChangedAt))
            .slice(0, 5)
            .map((row) => ({
              key: row.id,
              kind: 'cra' as const,
              recordId: row.id,
              status: row.status,
              period: row.period,
              name: null,
              at: row.statusChangedAt,
            })),
        };
      }

      if (actor.role === 'manager') {
        const today = isoDateInFirmTimeZone(dependencies.clock.now());
        // `billableCents` still reads off `preFacturierComposition` for the requested period
        // specifically (ADR-0053, ADR-0065) — a month's own billable total, not an actionable
        // state. `pendingDecisions`/`lateCras` no longer come from it (ADR-0082): a Cra awaiting a
        // decision or already late does not stop being either just because the requested period
        // changed, so both are read across every period the manager may see instead.
        const { composition, allCras, consultantNames } = await dependencies.transactionally(
          async (unit) => ({
            composition: await preFacturierComposition(unit, {
              actor,
              requestedPeriod: query.value.period,
              today,
            }),
            allCras: await unit.cras.list({
              actor,
              limit: CRA_LIST_MAX_PAGE_SIZE,
              offset: 0,
            }),
            consultantNames: await new PgReferenceReader(unit.client).consultantNames(),
          }),
        );

        const actionable = allCras.filter((row) => row.status !== 'validated');

        const awaitingDecision = actionable
          .filter((row) => row.status === 'submitted')
          .toSorted((left, right) =>
            (left.statusChangedAt ?? '').localeCompare(right.statusChangedAt ?? ''),
          )
          .map((row) => ({
            craId: row.id,
            consultantId: row.consultantId,
            consultantName: consultantNames.get(row.consultantId) ?? row.consultantId,
            period: row.period,
            statusChangedAt: row.statusChangedAt,
          }));

        return {
          period: query.value.period,
          role: 'manager' as const,
          pendingDecisions: awaitingDecision.length,
          billableCents: composition.billable.reduce(
            (total, row) => total + row.totalExcludingVatCents,
            0,
          ),
          // ADR-0054: a closed period's Cra that never reached `validated`. `actionable` already
          // excludes `validated`, so only the closed-period test is left to apply.
          lateCras: actionable.filter((row) => lastDayOf(periodFromIso(row.period)) < today).length,
          awaitingDecision,
          recentActivity: allCras
            .filter(
              (row): row is typeof row & { statusChangedAt: string } =>
                row.statusChangedAt !== null,
            )
            .toSorted((left, right) => right.statusChangedAt.localeCompare(left.statusChangedAt))
            .slice(0, 5)
            .map((row) => ({
              key: row.id,
              kind: 'cra' as const,
              recordId: row.id,
              status: row.status,
              period: row.period,
              name: consultantNames.get(row.consultantId) ?? row.consultantId,
              at: row.statusChangedAt,
              consultantId: row.consultantId,
            })),
        };
      }

      // One page of the office's invoices for the month, not a `COUNT(*)`: the three figures
      // below are bounded by `MAX_PAGE_SIZE`, the cap every list read in this file shares. The
      // seed reaches three invoices in a month; an office that reached fifty-one would read the
      // fifty-first as absent, and the fix then is a counting query, not a larger page.
      //
      // `everyPeriod` is a second, unfiltered read of the same page bound (ADR-0082's own
      // reasoning applied to billing): the queue below is "the oldest drafts across every month",
      // not "this month's drafts", so it cannot come off the period-scoped `invoices` read.
      const { invoices, everyPeriod } = await dependencies.transactionally(async (unit) => ({
        invoices: await unit.invoices.list({
          actor,
          limit: MAX_PAGE_SIZE,
          offset: 0,
          period: query.value.period,
        }),
        everyPeriod: await unit.invoices.list({ actor, limit: MAX_PAGE_SIZE, offset: 0 }),
      }));

      const oldestDrafts = everyPeriod
        .filter((invoice) => invoice.status === 'draft')
        .toSorted((left, right) => left.supplyPeriod.localeCompare(right.supplyPeriod))
        .slice(0, 10)
        .map((invoice) => ({
          invoiceId: invoice.id,
          billedToName: invoice.billedToName,
          supplyPeriod: invoice.supplyPeriod,
          totalTtcCents: invoice.totalTtcCents ?? 0,
        }));

      return {
        period: query.value.period,
        role: 'billing' as const,
        draftInvoices: invoices.filter((invoice) => invoice.status === 'draft').length,
        issuedInvoices: invoices.filter((invoice) => invoice.status === 'issued').length,
        totalTtcIssuedCents: invoices
          .filter((invoice) => invoice.status === 'issued')
          .reduce((total, invoice) => total + (invoice.totalTtcCents ?? 0), 0),
        oldestDrafts,
        recentActivity: everyPeriod
          .filter(
            (invoice): invoice is typeof invoice & { issueDate: string } =>
              invoice.issueDate !== null,
          )
          .toSorted((left, right) => right.issueDate.localeCompare(left.issueDate))
          .slice(0, 5)
          .map((invoice) => ({
            key: invoice.id,
            kind: 'invoice' as const,
            recordId: invoice.id,
            status: invoice.status,
            period: invoice.supplyPeriod,
            name: invoice.billedToName,
            at: invoice.issueDate,
          })),
      };
    },
  );

  // ── Writes ────────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/assignments',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const body = parseInput(AssignmentBody, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const outcome = await dependencies.transactionally((unit) =>
        createAssignment(unit.client, requireActor(request), dependencies.newId, body.value),
      );
      if (outcome.kind === 'notFound') {
        return sendProblem(reply, notFound(request, 'consultant or mission'));
      }
      if (outcome.kind === 'refused') {
        return sendProblem(reply, assignmentRefusal(request, outcome));
      }
      return reply.code(201).send(outcome);
    },
  );

  app.put(
    '/api/v1/assignments/:id',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));
      const body = parseInput(AssignmentBody, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const outcome = await dependencies.transactionally((unit) =>
        updateAssignment(unit.client, requireActor(request), params.value.id, body.value),
      );
      if (outcome.kind === 'notFound') return sendProblem(reply, notFound(request, 'assignment'));
      if (outcome.kind === 'refused') {
        return sendProblem(reply, assignmentRefusal(request, outcome));
      }
      return reply.code(200).send(outcome);
    },
  );

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

      return reply.code(200).send({ craId: outcome.craId, status: 'refused' });
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
