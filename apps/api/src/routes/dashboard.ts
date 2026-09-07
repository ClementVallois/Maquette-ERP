import {
  daysOf,
  isoDateInFirmTimeZone,
  lastDayOf,
  periodFromIso,
  QUARTER_DAYS_PER_DAY,
} from '@erp/platform';
import { workingCalendar } from '@erp/timesheet';
import type { FastifyInstance } from 'fastify';

import { preFacturierComposition } from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { managerStaffingSnapshot } from '../staffing/staffing-snapshot.ts';
import { malformed, parseInput } from '../validation.ts';

import { CRA_LIST_MAX_PAGE_SIZE, MAX_PAGE_SIZE, PeriodQuery } from './schemas.ts';

export function registerDashboardRoutes(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  /**
   * Item 18, QA round 3: the dashboard's org-chart panel — a consultant's own manager (N+1), or a
   * manager's direct reports (N-1) plus their own manager (N+1). No existing route exposed this:
   * `PgReferenceReader.hierarchy()` was write-side only until now (`refuse-cra.ts`,
   * `validate-cra.ts`, deciding who accepts a Cra) — reused here rather than adding new SQL, since
   * it already loads every `manager_attachments` row and answers "who manages X today" from it.
   * A manager's reports are found by inverting it against `consultantsOfOffice` (item 7's own
   * reader method, ADR-0077), which already excludes a departed consultant (ADR-0079) — no
   * separate exclusion needed here. `billing` has no place in this org chart in the seed (Henri,
   * the one billing persona, is the *director* every manager reports to, not a subject of this
   * read) — `forRoles` below omits it, the same reasoning `/api/v1/consultants` gives for the
   * same role.
   */
  app.get(
    '/api/v1/org-chart',
    { config: { access: forRoles('consultant', 'manager') } },
    async (request) => {
      const actor = requireActor(request);
      const today = isoDateInFirmTimeZone(dependencies.clock.now());

      return dependencies.transactionally(async (unit) => {
        const reader = new PgReferenceReader(unit.client);
        const [chain, names] = await Promise.all([reader.hierarchy(), reader.consultantNames()]);

        const managerId = chain.managerOn(actor.consultantId, today);
        const manager =
          managerId === null
            ? null
            : { id: managerId, displayName: names.get(managerId) ?? managerId };

        if (actor.role === 'consultant') return { role: 'consultant' as const, manager };

        const officeRoster = await reader.consultantsOfOffice(actor.officeId);
        const reports = officeRoster.filter(
          (consultant) => chain.managerOn(consultant.id, today) === actor.consultantId,
        );

        return { role: 'manager' as const, manager, reports };
      });
    },
  );
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
          availablePeriods: [...new Set(allCras.map((row) => row.period))].toSorted().toReversed(),
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
        const { composition, allCras, consultantNames, staffing } =
          await dependencies.transactionally(async (unit) => ({
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
            // Item 3, QA round 5 (ADR-0098): "as of today", not the requested period — see that
            // function's own header for why a staffing snapshot is not a monthly figure.
            staffing: await managerStaffingSnapshot(unit.client, actor.officeId, today),
          }));

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
          availablePeriods: [...new Set(allCras.map((row) => row.period))].toSorted().toReversed(),
          pendingDecisions: awaitingDecision.length,
          billableCents: composition.billable.reduce(
            (total, row) => total + row.totalExcludingVatCents,
            0,
          ),
          // ADR-0054: a closed period's Cra that never reached `validated`. `actionable` already
          // excludes `validated`, so only the closed-period test is left to apply.
          lateCras: actionable.filter((row) => lastDayOf(periodFromIso(row.period)) < today).length,
          awaitingDecision,
          staffing,
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
      const { invoices, everyPeriod, oldestDrafts } = await dependencies.transactionally(
        async (unit) => {
          const invoicesPage = await unit.invoices.list({
            actor,
            limit: MAX_PAGE_SIZE,
            offset: 0,
            period: query.value.period,
          });
          const everyPeriodPage = await unit.invoices.list({
            actor,
            limit: MAX_PAGE_SIZE,
            offset: 0,
          });

          // F10: the same consultant discriminator A7/A13 already added to the invoice and
          // pré-facturier lists — without it, several rows of this "ten oldest drafts" block can
          // share a client, a month and an amount with nothing to tell them apart.
          const consultantNames = await new PgReferenceReader(unit.client).consultantNames();
          const oldest = everyPeriodPage
            .filter((invoice) => invoice.status === 'draft')
            .toSorted((left, right) => left.supplyPeriod.localeCompare(right.supplyPeriod))
            .slice(0, 10);

          const oldestWithConsultant = [];
          for (const item of oldest) {
            // Sequential, not `Promise.all`, for the same reason the invoice list route's own A7
            // comment gives: every read here shares the one checked-out client this transaction is.
            const invoice = await unit.invoices.findById(item.id, actor);
            const sourceCraId = invoice?.lines[0]?.origin.craId;
            const sourceCra =
              sourceCraId === undefined ? null : await unit.cras.findById(sourceCraId, actor);

            oldestWithConsultant.push({
              invoiceId: item.id,
              billedToName: item.billedToName,
              supplyPeriod: item.supplyPeriod,
              totalTtcCents: item.totalTtcCents ?? 0,
              consultantName:
                sourceCra === null
                  ? '—'
                  : (consultantNames.get(sourceCra.consultantId) ?? sourceCra.consultantId),
            });
          }

          return {
            invoices: invoicesPage,
            everyPeriod: everyPeriodPage,
            oldestDrafts: oldestWithConsultant,
          };
        },
      );

      return {
        period: query.value.period,
        role: 'billing' as const,
        availablePeriods: [...new Set(everyPeriod.map((invoice) => invoice.supplyPeriod))]
          .toSorted()
          .toReversed(),
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
}
