import { vatGroupKey } from '@erp/billing';
import {
  API_PROBLEM_TYPES,
  type InvoiceDetail,
  type InvoiceHistoryResponse,
  type InvoiceListItem,
  type InvoiceListResponse,
  type InvoiceStatus,
  type IssuanceResponse,
} from '@erp/contracts';
import { isoDateInFirmTimeZone } from '@erp/platform';
import type { FastifyInstance } from 'fastify';

import { issueInvoice } from '../chain/issue-invoice.ts';
import { preFacturierComposition } from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { ApiFailure } from '../errors.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

import {
  BAD_REQUEST,
  CONFLICT,
  IdempotencyKey,
  IDEMPOTENCY_KEY_HEADER,
  IdParam,
  InvoiceListParams,
  notFound,
} from './schemas.ts';

/**
 * `PgInvoiceRepository.list`'s own `InvoiceListItem.status` is `string` — accurate for a value
 * that crosses the module boundary as an opaque string, but wider than `billing.invoices`' own
 * `CHECK (status IN (...))` actually allows. The cast is the one place that narrows it back to
 * the wire union, the same reasoning `dashboard.ts`/`pre-facturier.ts` give for the identical gap.
 */
function invoiceRowStatus(status: string): InvoiceStatus {
  return status as InvoiceStatus;
}

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
        const byYearAndStatus = (await unit.invoices.countByYearAndStatus(actor)).map((row) => ({
          ...row,
          status: invoiceRowStatus(row.status),
        }));

        // `preFacturierComposition` already computes a period's billable HT from the live
        // aggregate rather than a stored (and, for a draft, absent) total — reused here rather
        // than reimplemented, for the three months the seed actually fills.
        const today = isoDateInFirmTimeZone(dependencies.clock.now());
        const denseMonths = [];
        const recentPeriods = (await unit.cras.listPeriods(actor)).slice(0, 3).toReversed();
        for (const period of recentPeriods) {
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
        const invoices: InvoiceListItem[] = [];
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
            status: invoiceRowStatus(item.status),
            consultantName:
              sourceCra === null
                ? '—'
                : (consultantNames.get(sourceCra.consultantId) ?? sourceCra.consultantId),
            missionNames: lineMissionIds.map((id) => missionNames.get(id) ?? id),
            lineCount: invoice?.lines.length ?? 0,
            createdAt,
          });
        }

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
