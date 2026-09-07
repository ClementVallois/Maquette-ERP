import type {
  BillingDashboard,
  ConsultantDashboard,
  ConsultantOrgChart,
  ManagerDashboard,
  ManagerOrgChart,
} from '@erp/contracts';
import { daysOf, isoDateInFirmTimeZone, periodFromIso, QUARTER_DAYS_PER_DAY } from '@erp/platform';
import { CRA_STATUSES, workingCalendar } from '@erp/timesheet';
import type { FastifyInstance } from 'fastify';

import { preFacturierComposition } from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { managerStaffingSnapshot } from '../staffing/staffing-snapshot.ts';
import { malformed, parseInput } from '../validation.ts';

import { CRA_LIST_MAX_PAGE_SIZE, PeriodQuery } from './schemas.ts';

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

        if (actor.role === 'consultant') {
          const consultantOrgChart: ConsultantOrgChart = { role: 'consultant', manager };
          return consultantOrgChart;
        }

        const officeRoster = await reader.consultantsOfOffice(actor.officeId);
        const reports = officeRoster.filter(
          (consultant) => chain.managerOn(consultant.id, today) === actor.consultantId,
        );

        const managerOrgChart: ManagerOrgChart = { role: 'manager', manager, reports };
        return managerOrgChart;
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

        // Package 08: `availablePeriods`, `refusedPeriods` and `recentActivity` each get their
        // own scoped, unbounded query rather than being derived from one capped `list` page —
        // a page ordered by period can drop an old refused month, or the wrong "most recent"
        // row entirely, once the office (or, here, the consultant's own history) outgrows it.
        // Sequential, not `Promise.all`: every read here shares the one checked-out client this
        // transaction is (the same reasoning the invoice list route's own comment gives).
        const { cra, availablePeriods, refusedPeriods, recentActivity } =
          await dependencies.transactionally(async (unit) => {
            const craResult = await unit.cras.findByConsultantAndPeriod(
              actor.consultantId,
              period,
              actor,
            );
            const availablePeriodsResult = await unit.cras.listPeriods(actor);
            const refusedPeriodsResult = await unit.cras.refusedPeriods(actor.consultantId, actor);
            const recentActivityResult = await unit.cras.recentActivity(actor, 5);

            return {
              cra: craResult,
              availablePeriods: availablePeriodsResult,
              refusedPeriods: refusedPeriodsResult,
              recentActivity: recentActivityResult,
            };
          });

        const recordedByDay = new Map<string, number>();
        for (const line of cra?.lines ?? []) {
          recordedByDay.set(line.day, (recordedByDay.get(line.day) ?? 0) + line.quarterDays);
        }

        const consultantDashboard: ConsultantDashboard = {
          period: query.value.period,
          role: 'consultant',
          availablePeriods,
          myMonthStatus: cra?.status ?? null,
          recordedQuarterDays: cra?.lines.reduce((total, line) => total + line.quarterDays, 0) ?? 0,
          // A day short of its four quarter-days still counts as not entered — a day recorded
          // once is not a day recorded.
          remainingWorkableDays: workableDays.filter(
            (day) => (recordedByDay.get(day) ?? 0) < QUARTER_DAYS_PER_DAY,
          ).length,
          refusedPeriods,
          recentActivity: recentActivity
            .filter(
              (row): row is typeof row & { statusChangedAt: string } =>
                row.statusChangedAt !== null,
            )
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
        return consultantDashboard;
      }

      if (actor.role === 'manager') {
        const today = isoDateInFirmTimeZone(dependencies.clock.now());
        // ADR-0054's "closed period" is `lastDayOf(period) < today`, which — for any `today`
        // inside the period it names, always true by construction — is the same set as
        // `period < currentPeriod(today)`: the calendar month `today` falls in, taken verbatim
        // off the front of its own `YYYY-MM-DD` (the same convention `CraListQuery.beforePeriod`
        // itself already documents).
        const cutoffPeriod = today.slice(0, 7);

        // Package 08: `availablePeriods`, `pendingDecisions`, `lateCras`, `awaitingDecision` and
        // `recentActivity` each get their own scoped query — a count, a sum, or an explicitly
        // sorted-and-limited-in-SQL read — rather than being derived from one `list` page capped
        // at `CRA_LIST_MAX_PAGE_SIZE`. `billableCents` still reads off `preFacturierComposition`
        // for the requested period specifically (ADR-0053, ADR-0065) — a month's own billable
        // total, not an actionable state; `pendingDecisions`/`lateCras` stay period-independent
        // (ADR-0082): a Cra awaiting a decision or already late does not stop being either just
        // because the requested period changed. Sequential, not `Promise.all` (package 15's own
        // finding on this same client): every read here shares the one checked-out client this
        // transaction is.
        const {
          composition,
          availablePeriods,
          pendingDecisions,
          lateCras,
          awaitingDecisionRows,
          recentActivityRows,
          consultantNames,
          staffing,
        } = await dependencies.transactionally(async (unit) => {
          const compositionResult = await preFacturierComposition(unit, {
            actor,
            requestedPeriod: query.value.period,
            today,
          });
          const availablePeriodsResult = await unit.cras.listPeriods(actor);
          const pendingDecisionsResult = await unit.cras.count({ actor, statuses: ['submitted'] });
          const lateCrasResult = await unit.cras.count({
            actor,
            // Every status but `validated` — derived from `CRA_STATUSES`, not hand-listed, so a
            // fifth status added there does not silently fall out of "actionable" here.
            statuses: CRA_STATUSES.filter((status) => status !== 'validated'),
            beforePeriod: cutoffPeriod,
          });
          // `CRA_LIST_MAX_PAGE_SIZE`, not unbounded: a genuine ceiling on a real queue (ADR-0081's
          // own 65-Cra worst case is well under it), sorted and limited in SQL rather than sliced
          // out of a page — the two are no longer the same operation.
          const awaitingDecisionResult = await unit.cras.awaitingDecision(
            actor,
            CRA_LIST_MAX_PAGE_SIZE,
          );
          const recentActivityResult = await unit.cras.recentActivity(actor, 5);
          const consultantNamesResult = await new PgReferenceReader(unit.client).consultantNames();
          // Item 3, QA round 5 (ADR-0098): "as of today", not the requested period — see that
          // function's own header for why a staffing snapshot is not a monthly figure.
          const staffingResult = await managerStaffingSnapshot(unit.client, actor.officeId, today);

          return {
            composition: compositionResult,
            availablePeriods: availablePeriodsResult,
            pendingDecisions: pendingDecisionsResult,
            lateCras: lateCrasResult,
            awaitingDecisionRows: awaitingDecisionResult,
            recentActivityRows: recentActivityResult,
            consultantNames: consultantNamesResult,
            staffing: staffingResult,
          };
        });

        const awaitingDecision = awaitingDecisionRows.map((row) => ({
          craId: row.id,
          consultantId: row.consultantId,
          consultantName: consultantNames.get(row.consultantId) ?? row.consultantId,
          period: row.period,
          statusChangedAt: row.statusChangedAt,
        }));

        const managerDashboard: ManagerDashboard = {
          period: query.value.period,
          role: 'manager',
          availablePeriods,
          pendingDecisions,
          billableCents: composition.billable.reduce(
            (total, row) => total + row.totalExcludingVatCents,
            0,
          ),
          lateCras,
          awaitingDecision,
          staffing,
          recentActivity: recentActivityRows
            .filter(
              (row): row is typeof row & { statusChangedAt: string } =>
                row.statusChangedAt !== null,
            )
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
        return managerDashboard;
      }

      // Package 08: `draftInvoices`, `issuedInvoices` and `totalTtcIssuedCents` each get their
      // own scoped `count`/`sumTtcCents` for the requested period — never a page's own `.filter`
      // and `.reduce`, which silently drops the fifty-first invoice an office that busy would
      // have. `availablePeriods` and `oldestDrafts` read every period, not the requested one
      // (ADR-0082's own reasoning applied to billing): a work queue does not stop existing
      // because the requested period changed, the same shape package 08 also applies to `cras`.
      // `oldestDrafts`/`recentIssued` are sorted and limited in SQL directly — the audit's own
      // "oldest drafts... ordered by newest supply period" finding, closed at the query itself
      // rather than by a wider page (raising `MAX_PAGE_SIZE` would not fix an ordering defect).
      const {
        draftInvoices,
        issuedInvoices,
        totalTtcIssuedCents,
        availablePeriods,
        oldestDraftRows,
        recentIssuedRows,
      } = await dependencies.transactionally(async (unit) => {
        const draftInvoicesResult = await unit.invoices.count({
          actor,
          period: query.value.period,
          status: 'draft',
        });
        const issuedInvoicesResult = await unit.invoices.count({
          actor,
          period: query.value.period,
          status: 'issued',
        });
        const totalTtcIssuedCentsResult = await unit.invoices.sumTtcCents({
          actor,
          period: query.value.period,
          status: 'issued',
        });
        const availablePeriodsResult = await unit.invoices.listPeriods(actor);
        const oldestDraftRowsResult = await unit.invoices.oldestDrafts(actor, 10);
        const recentIssuedRowsResult = await unit.invoices.recentIssued(actor, 5);

        // F10: the same consultant discriminator A7/A13 already added to the invoice and
        // pré-facturier lists — without it, several rows of this "ten oldest drafts" block can
        // share a client, a month and an amount with nothing to tell them apart.
        const consultantNames = await new PgReferenceReader(unit.client).consultantNames();
        const oldestWithConsultant = [];
        for (const item of oldestDraftRowsResult) {
          // Sequential, not `Promise.all`, for the same reason the invoice list route's own A7
          // comment gives: every read here shares the one checked-out client this transaction is.
          const sourceCra =
            item.sourceCraId === null ? null : await unit.cras.findById(item.sourceCraId, actor);

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
          draftInvoices: draftInvoicesResult,
          issuedInvoices: issuedInvoicesResult,
          totalTtcIssuedCents: totalTtcIssuedCentsResult,
          availablePeriods: availablePeriodsResult,
          oldestDraftRows: oldestWithConsultant,
          recentIssuedRows: recentIssuedRowsResult,
        };
      });

      const billingDashboard: BillingDashboard = {
        period: query.value.period,
        role: 'billing',
        availablePeriods,
        draftInvoices,
        issuedInvoices,
        totalTtcIssuedCents,
        oldestDrafts: oldestDraftRows,
        recentActivity: recentIssuedRows
          .filter(
            (invoice): invoice is typeof invoice & { issueDate: string } =>
              invoice.issueDate !== null,
          )
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
      return billingDashboard;
    },
  );

  // ── Writes ────────────────────────────────────────────────────────────────
}
