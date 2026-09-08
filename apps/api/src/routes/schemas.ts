import { API_PROBLEM_TYPES } from '@erp/contracts';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { contextOf } from '../http/reply.ts';

/**
 * This file holds only what is genuinely common across resource route files — pagination bounds,
 * a shared query shape, and the two HTTP-shaped helpers (`notFound`, the status constants) any
 * resource's error responses reach for. A schema that validates one resource's own input lives
 * next to the route file that consumes it, not here ("keep
 * resource-specific schemas next to their routes; share only genuinely common input schemas and
 * HTTP helpers"). The discriminator used throughout: a schema imported by exactly one resource
 * file moved into it; one imported by two or more, or built from a constant two or more resource
 * files reference directly, stayed here.
 */

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;
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
 * `GET /api/v1/cras`'s own cap (ADR-0081) — deliberately **not** `MAX_PAGE_SIZE` above, which
 * `/api/v1/invoices` and every other list in this file share: raising the shared constant would
 * raise theirs too, unmeasured. The seeded worst case is Paris, 65 Cras in one office once the
 * dense months and the sparse 2016 history exist (`docs/adr/0080-…`); this cap clears it with
 * headroom for
 * organic growth rather than merely matching it. `MAX_PAGE_SIZE` is still the hard ceiling
 * BUILD-RULES asks for ("no 'show all'"): 200 is a fixed number, not `Infinity`, and a caller who
 * asks for more still gets refused by `Pagination`'s own `.max()` shape, reproduced here at a
 * different value. Shared by `cra.ts` (where the cap applies) and `dashboard.ts` (the "CRA en
 * retard" deep link's own query, measured against the same real worst case).
 */
export const CRA_LIST_MAX_PAGE_SIZE = 200;

/** Shared by `dashboard.ts` and `economics.ts`: a bare `?period=` query, nothing else. */
export const PeriodQuery = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });

/**
 * The year half of the year/month filter. Shared by `cra.ts`'s
 * `CraListParams` and `invoices.ts`'s `InvoiceListParams`, which both filter on the four-digit
 * prefix of a `YYYY-MM` text period column (migration 002's own comment on why it is text, not a
 * date) under the identical bounds; the month half (`MonthQuery`) has only the one CRA consumer
 * and lives in `cra.ts`.
 */
export const YearQuery = z.coerce.number().int().min(2000).max(2100).optional();

/** Shared by `cra.ts`, `invoices.ts` and `assignments.ts`: a single record id in the path. */
export const IdParam = z.object({ id: z.string().min(1).max(64) });

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
