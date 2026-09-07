import { INVOICE_STATUSES } from '@erp/billing';
import { API_PROBLEM_TYPES } from '@erp/contracts';
import { CRA_STATUSES } from '@erp/timesheet';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { contextOf } from '../http/reply.ts';
import type { AssignmentWriteOutcome } from '../staffing/assignment-admin.ts';

export const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;
const NOT_FOUND = 404;
export const BAD_REQUEST = 400;
export const CONFLICT = 409;

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
export const Pagination = z.object({
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
export const CRA_LIST_MAX_PAGE_SIZE = 200;

export const PeriodQuery = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });
export const PreFacturierParams = PeriodQuery.extend({
  craLimit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  craOffset: z.coerce.number().int().min(0).default(0),
  invoiceLimit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  invoiceOffset: z.coerce.number().int().min(0).default(0),
  consultantSearch: z.string().trim().min(1).max(100).optional(),
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
export const CraListParams = Pagination.extend({
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
  // Item 22, QA round 3: the dashboard's "CRA en retard" deep link — every period strictly
  // before this one, matching `lateCras`' own `lastDayOf(period) < today` (`CraListQuery`'s own
  // doc comment, `packages/timesheet`, has the equivalence).
  beforePeriod: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional(),
});

export const InvoiceListParams = Pagination.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  year: YearQuery,
  search: z.string().trim().min(1).max(100).optional(),
});

export const IdParam = z.object({ id: z.string().min(1).max(64) });
export const ConsultantParams = z.object({ consultantId: z.string().min(1).max(64) });

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

export const MonthEntries = z.object({
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

export const PeriodParam = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });
export const ConsultantPeriodParams = z.object({
  consultantId: z.string().min(1).max(64),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
});

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IdempotencyKey = z.string().min(8).max(200);

/**
 * The bound is a schema check — "is this a request" — and it stops short of trimming: a
 * whitespace-only reason of the right length still reaches `refuse()`, whose own
 * `RefusalReasonRequiredError` is the "is this a legitimate refusal" half of ADR-0042.
 */
export const RefusalBody = z.object({ reason: z.string().min(1).max(500) });
const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
export const AssignmentBody = z.object({
  consultantId: z.string().min(1).max(64),
  missionId: z.string().min(1).max(64),
  fromDate: IsoDateString,
  toDate: IsoDateString.nullable().default(null),
});

export function notFound(
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

export function assignmentRefusal(
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
