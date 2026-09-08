import { INVOICE_STATUSES, vatGroupKey } from '@erp/billing';
import {
  API_PROBLEM_TYPES,
  type InvoiceDetail,
  type InvoiceHistoryResponse,
  type InvoiceListItem,
  type InvoiceListResponse,
  type IssuanceResponse,
} from '@erp/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { issueInvoice } from '../chain/issue-invoice.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { ApiFailure } from '../errors.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

import { CONFLICT, IdParam, notFound, Pagination, YearQuery } from './schemas.ts';

const InvoiceListParams = Pagination.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  year: YearQuery,
  search: z.string().trim().min(1).max(100).optional(),
});

/** This route's own bad-request status: the one place in this file that refuses a request. */
const BAD_REQUEST = 400;

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IdempotencyKey = z.string().min(8).max(200);

export function registerInvoiceRoutes(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  /** Two historical series: yearly invoice counts and billable totals for recent CRA periods. */
  app.get(
    '/api/v1/invoices/history',
    { config: { access: forRoles('manager', 'billing') } },
    async (request) => {
      const actor = requireActor(request);

      return dependencies.transactionally(async (unit) => {
        const byYearAndStatus = await unit.invoices.countByYearAndStatus(actor);

        const denseMonths = [];
        const recentPeriods = (await unit.cras.listPeriods(actor)).slice(0, 3).toReversed();
        for (const period of recentPeriods) {
          denseMonths.push({
            period,
            billableCents: await unit.invoices.sumHtCents({ actor, period }),
          });
        }

        const historyResponse: InvoiceHistoryResponse = { byYearAndStatus, denseMonths };
        return historyResponse;
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
        const page = await unit.invoices.listProjection({
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
        const sourceCras = await unit.cras.findListItemsByIds(
          page.flatMap((item) => (item.sourceCraId === null ? [] : [item.sourceCraId])),
          actor,
        );
        const consultantNames = await reference.consultantNames(
          sourceCras.map((cra) => cra.consultantId),
        );
        const missionNames = await reference.missionNames(page.flatMap((item) => item.missionIds));
        const sourceCrasById = new Map(sourceCras.map((cra) => [cra.id, cra]));

        const invoices: InvoiceListItem[] = page.map((item) => {
          const sourceCra =
            item.sourceCraId === null ? null : (sourceCrasById.get(item.sourceCraId) ?? null);

          return {
            id: item.id,
            status: item.status,
            supplyPeriod: item.supplyPeriod,
            billedToName: item.billedToName,
            invoiceNumber: item.invoiceNumber,
            issueDate: item.issueDate,
            totalTtcCents: item.totalTtcCents,
            totalsAreProvisional: item.totalsAreProvisional,
            consultantName:
              sourceCra === null
                ? '—'
                : (consultantNames.get(sourceCra.consultantId) ?? sourceCra.consultantId),
            missionNames: item.missionIds.map((id) => missionNames.get(id) ?? id),
            lineCount: item.lineCount,
            createdAt: sourceCra?.statusChangedAt ?? null,
          };
        });

        const listResponse: InvoiceListResponse = {
          invoices,
          total,
          limit: query.value.limit,
          offset: query.value.offset,
          statusCounts,
        };
        return listResponse;
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
        const consultantNames = await reference.consultantNames(
          sourceCra === null ? [] : [sourceCra.consultantId],
        );
        const missionNames = await reference.missionNames(
          invoice.lines.map((line) => line.origin.missionId),
        );
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

      const invoiceDetail: InvoiceDetail = {
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
      return invoiceDetail;
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

      // `IssueInvoiceOutcome`'s fields are `| null` on the flat interface because `notFound` and
      // `keyReused` carry none — both are excluded by the two guards above, and `issueInvoice`'s
      // own `issued`/`replayed` branches never construct one of these three fields without the
      // other two. The type does not express that pairing; the check does, loudly, rather than
      // casting past a `null` that should be structurally impossible here.
      if (
        outcome.invoiceNumber === null ||
        outcome.issueDate === null ||
        outcome.totalTtcCents === null
      ) {
        throw new ApiFailure(
          `issueInvoice returned kind '${outcome.kind}' with no invoiceNumber/issueDate/totalTtcCents`,
        );
      }

      const issuanceResponse: IssuanceResponse = {
        invoiceId: outcome.invoiceId,
        replayed: outcome.kind === 'replayed',
        invoiceNumber: outcome.invoiceNumber,
        issueDate: outcome.issueDate,
        totalTtcCents: outcome.totalTtcCents,
      };
      return reply.code(200).send(issuanceResponse);
    },
  );
}
