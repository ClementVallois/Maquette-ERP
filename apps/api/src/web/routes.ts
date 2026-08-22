import type { DeclineReason } from '@erp/billing';
import { API_PROBLEM_TYPES, type ProblemDetails } from '@erp/contracts';
import {
  daysOf,
  isoDateInFirmTimeZone,
  lastDayOf,
  periodFromIso,
  periodToIso,
} from '@erp/platform';
import { type CraLine, type CraStatus, workingCalendar } from '@erp/timesheet';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { issueInvoice } from '../chain/issue-invoice.ts';
import { type HalfDayEntry, recordMonth } from '../chain/record-month.ts';
import { refuseCra } from '../chain/refuse-cra.ts';
import { validateCraAndDraftInvoices } from '../chain/validate-cra.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { consultantEconomics } from '../economics/consultant-economics.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { carries, forRoles, PUBLIC, requireActor } from '../personas/access.ts';
import { clearedPersonaCookie, personaCookie } from '../personas/cookie.ts';
import { personaFor } from '../personas/resolved.ts';
import { malformed, parseInput } from '../validation.ts';

import { STYLESHEET } from './assets.ts';
import { craGridPage, type GridDay, type SlotValue, totalsOf } from './pages/cra-grid.ts';
import { craListPage } from './pages/cra-list.ts';
import { craPrintPage } from './pages/cra-print.ts';
import { invoicePage } from './pages/invoice.ts';
import { marginPage } from './pages/margin.ts';
import { personaSelectorPage } from './pages/persona-selector.ts';
import { type CraRow, preFacturierPage } from './pages/pre-facturier.ts';
import { PATHS } from './paths.ts';
import { redirectTo, sendPage } from './reply.ts';

/**
 * The screens (ADR-0048: they share this deployable with `/api/v1`, and the two differ by a
 * directory and a content type, not by a boundary).
 *
 * Every route here declares its `Access` exactly as an API route does, goes through the same origin
 * check, and refuses through the same `sendProblem` — which renders the refusal as a page because
 * of the path it is on, not because this file did anything special.
 */

const NOT_FOUND = 404;
const CONFLICT = 409;
const NOT_MODIFIED = 304;
/** A consultant's whole history fits well inside the repository's hard cap of fifty. */
const MAX_MONTHS = 50;
const SLOTS = [0, 1] as const;

/**
 * The declarations the verbs are registered with, named because a **screen reads them too**
 * (ADR-0023). A button that offers an action asks the action's own `Access` whether this role
 * carries it, through `carries` — so the offer cannot drift from the refusal, and moving a verb
 * between roles moves its button in the same edit. `routes.test.ts` proves the route each one is
 * registered on is the route the screen asks about.
 */
export const DECIDES_CRA = forRoles('manager');
export const ISSUES_INVOICE = forRoles('billing');

const ConsultantParam = z.object({ consultantId: z.string().min(1).max(64) });
const IdParam = z.object({ id: z.string().min(1).max(64) });

/**
 * The manager's refusal. The reason is required by the domain too (`RefusalReasonRequiredError`),
 * and both checks exist on purpose: this one answers "is this a request", the domain's answers
 * "is this a legitimate refusal" — a whitespace-only reason passes the first and not the second.
 */

/** The key the form minted when it rendered (ADR-0059), in the shape ADR-0044 requires. */
const Issuance = z.object({ idempotencyKey: z.string().min(8).max(200) });

const SelectPersona = z.object({ key: z.string().min(1).max(64) });
const PeriodParam = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) });
const PeriodFilter = z.object({
  periode: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .optional(),
});

/**
 * What the grid posts (ADR-0050): one field per half-day slot, named `YYYY-MM-DD:0` or `:1`, whose
 * value is `''`, `absence`, or a mission id — plus which button was pressed.
 *
 * `looseObject` rather than the strict default, because the field **names are data**: they are the
 * days of a month, and a schema cannot enumerate them without knowing which month. Zod checks the
 * one field whose name is fixed; `SLOT_FIELD` below is the boundary check for the rest, and it is
 * an allowlist — a name that is not exactly a date and a slot is dropped, never interpreted.
 *
 * Nothing here checks that the days belong to the period, that they are workable, or that the
 * mission exists. Those are domain rules and the domain owns them (ADR-0042): a hand-crafted body
 * naming July inside June's form gets `DayOutsidePeriodError` as a typed 422, not a silent drop.
 */
const GridSubmission = z.looseObject({
  action: z.union([z.literal('save'), z.literal('submit')]).default('save'),
});

const SLOT_FIELD = /^(\d{4}-\d{2}-\d{2}):([01])$/u;

const Refusal = z.object({
  reason: z.string().min(1).max(500),
  ...PeriodFilter.shape,
});

/** The month the manager was looking at, echoed back so the redirect returns to that view. */
const ActedFrom = z.object(PeriodFilter.shape);

function backToPreFacturier(periode: string | undefined): string {
  return periode === undefined ? PATHS.preFacturier : `${PATHS.preFacturier}?periode=${periode}`;
}

/**
 * The posted form, read back into half-day entries. Anything that is not a slot field is ignored
 * rather than refused: the same body carries the `action` button, and a browser adds fields nobody
 * asked for.
 */
function entriesOf(body: Record<string, unknown>): HalfDayEntry[] {
  const entries: HalfDayEntry[] = [];

  for (const [name, raw] of Object.entries(body)) {
    const match = SLOT_FIELD.exec(name);
    if (match === null || typeof raw !== 'string' || raw === '') continue;

    const [, day = ''] = match;
    entries.push(
      raw === 'absence'
        ? { day, dayType: 'absence', missionId: null }
        : { day, dayType: 'worked', missionId: raw },
    );
  }

  return entries;
}

/** Every day of the month, workable or not, with what is recorded in each of its two slots. */
function gridDays(periodIso: string, lines: readonly CraLine[]): GridDay[] {
  const calendar = workingCalendar();

  return daysOf(periodFromIso(periodIso)).map((date) => {
    // A line of two half-days fills both slots; two lines of one fill one each, in the order the
    // record holds them. Which slot a half-day sits in is a fact about the form, never about the
    // record — the domain has no morning.
    const slots: (SlotValue | null)[] = [null, null];
    let next = 0;

    for (const line of lines.filter((candidate) => candidate.day === date)) {
      const value: SlotValue =
        line.dayType === 'absence'
          ? { kind: 'absence' }
          : { kind: 'mission', missionId: line.missionId ?? '' };

      for (let taken = 0; taken < line.halfDays && next < SLOTS.length; taken += 1) {
        slots[next] = value;
        next += 1;
      }
    }

    return { date, nonWorkable: calendar.nonWorkableReason(date), slots };
  });
}

/**
 * The months the period picker offers.
 *
 * Read off a page of Cras ordered by period descending, so it can omit an old month and never a
 * recent one — which is the behaviour a period picker wants. The selected month's rows come from
 * a second, period-filtered query (ADR-0053), so what the dropdown offers never bounds what the
 * table shows.
 */
function offeredPeriods(cras: readonly { period: string }[]): string[] {
  return [...new Set(cras.map((cra) => cra.period))].sort((left, right) =>
    right.localeCompare(left),
  );
}

/**
 * Why the half-days of one `Cra` are not on an invoice — two shapes, and they differ in kind
 * (ADR-0037 for the first, `CraStatus` for the second).
 *
 * A `Validated` Cra has been through the chain, so everything not billed has a typed decline
 * reason. A Cra in any other status has not reached `billing` at all, and the block is the
 * workflow rather than a rule of billing: saying "no reason recorded" there would be false.
 */
function blockingOf(
  cra: { readonly id: string; readonly recordedHalfDays: number },
  status: CraStatus,
  declined: readonly {
    craId: string;
    missionId: string;
    halfDays: number;
    reason: DeclineReason;
  }[],
  missionNames: ReadonlyMap<string, string>,
): CraRow['blocking'] {
  if (status !== 'validated') {
    return cra.recordedHalfDays === 0
      ? []
      : [{ halfDays: cra.recordedHalfDays, why: { kind: 'notValidated', status } }];
  }

  return declined
    .filter((record) => record.craId === cra.id)
    .map((record) => ({
      halfDays: record.halfDays,
      why: {
        kind: 'declined',
        reason: record.reason,
        missionName: missionNames.get(record.missionId) ?? record.missionId,
      },
    }));
}

/** The one refusal both manager verbs can produce that is an absence rather than a rule. */
function craNotFound(request: FastifyRequest): ProblemDetails {
  return {
    type: API_PROBLEM_TYPES.notFound,
    title: 'No such Cra',
    status: NOT_FOUND,
    detail: 'This Cra does not exist, or has never existed.',
    ...contextOf(request),
  };
}

export function registerWebRoutes(app: FastifyInstance, dependencies: ServerDependencies): void {
  app.get(
    STYLESHEET.path,
    { config: { access: PUBLIC('a stylesheet is not addressed to anyone in particular') } },
    (request, reply) => {
      // The URL carries the file's content hash, so a changed stylesheet is a changed URL and this
      // response can never be stale. `immutable` is what that fact earns.
      if (request.headers['if-none-match'] === STYLESHEET.etag) {
        return reply.code(NOT_MODIFIED).send();
      }

      return reply
        .type(STYLESHEET.contentType)
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('etag', STYLESHEET.etag)
        .send(STYLESHEET.body);
    },
  );

  app.get(
    PATHS.home,
    { config: { access: PUBLIC('the selector must render before a persona is chosen') } },
    async (request, reply) =>
      sendPage(reply, personaSelectorPage(await dependencies.personas.list(), personaFor(request))),
  );

  app.post(
    PATHS.choosePersona,
    { config: { access: PUBLIC('choosing a persona is how an identity is acquired at all') } },
    async (request, reply) => {
      const body = parseInput(SelectPersona, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const persona = await dependencies.personas.byKey(body.value.key);
      if (persona === null) {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.notFound,
          title: 'No such persona',
          status: NOT_FOUND,
          detail: 'This persona does not exist on this instance.',
          ...contextOf(request),
        });
      }

      return redirectTo(
        reply.header('set-cookie', personaCookie(persona.key, dependencies.config)),
        PATHS.home,
      );
    },
  );

  // ── The consultant's own months ───────────────────────────────────────────

  app.get(
    PATHS.consultantCra,
    { config: { access: forRoles('consultant') } },
    async (request, reply) => {
      const query = parseInput(PeriodFilter, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);
      const wanted = query.value.periode;

      const cras = await dependencies.transactionally((unit) =>
        unit.cras.list({ actor, limit: MAX_MONTHS, offset: 0 }),
      );

      return sendPage(
        reply,
        craListPage(
          {
            // Filtered here rather than in the repository, and deliberately: the repository decides
            // which records this actor may **see** (ADR-0003), and a period is not an authorization
            // question. Pushing it down would blur the one distinction the scope matrix exists to
            // keep sharp — and the cap above already bounds what is read.
            cras: wanted === undefined ? cras : cras.filter((cra) => cra.period === wanted),
            filter: wanted ?? null,
            offeredPeriods: offeredPeriods(cras),
          },
          personaFor(request),
        ),
      );
    },
  );

  app.get(
    `${PATHS.consultantCra}/:period`,
    { config: { access: forRoles('consultant') } },
    async (request, reply) => {
      const params = parseInput(PeriodParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);
      const period = periodFromIso(params.value.period);

      const view = await dependencies.transactionally(async (unit) => {
        const cra = await unit.cras.findByConsultantAndPeriod(actor.consultantId, period, actor);
        // Only the missions this consultant is staffed on during the month reach the dropdown.
        // Not a security control — the submission check is (ADR-0051 and task 1.5) — but a form
        // that offers a mission the domain will refuse is a form that teaches the user nothing.
        const reference = await new PgReferenceReader(unit.client).timesheet();
        const names = await new PgReferenceReader(unit.client).missionNames();

        const missions = [...names]
          .filter(([id]) =>
            daysOf(period).some((day) => reference.isAssigned(actor.consultantId, id, day)),
          )
          .map(([id, name]) => ({ id, name }));

        return {
          period: params.value.period,
          craId: cra?.id ?? null,
          status: cra?.status ?? null,
          days: gridDays(params.value.period, cra?.lines ?? []),
          missions,
          flags: cra?.flags ?? [],
          totals: totalsOf(cra?.lines ?? []),
          // `draft` and `refused` are editable; `submitted` and `validated` are not, and the domain
          // is the one that says so (ADR-0005). The screen reads the same fact rather than owning a
          // second copy of it.
          editable: cra === null || cra.status === 'draft' || cra.status === 'refused',
          refusal: cra?.refusal ?? null,
        };
      });

      return sendPage(reply, craGridPage(view, personaFor(request)));
    },
  );

  app.post(
    `${PATHS.consultantCra}/:period`,
    { config: { access: forRoles('consultant') } },
    async (request, reply) => {
      const params = parseInput(PeriodParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const body = parseInput(GridSubmission, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      await recordMonth(
        {
          transactionally: dependencies.transactionally,
          clock: dependencies.clock,
          newId: dependencies.newId,
        },
        {
          actor: requireActor(request),
          period: periodFromIso(params.value.period),
          entries: entriesOf(body.value),
          submit: body.value.action === 'submit',
        },
      );

      // Back to the grid, so the month that was saved is the month that is shown. A refusal never
      // reaches here: it is thrown, and `sendProblem` renders it as a page carrying the same
      // typed reason the API would have returned.
      return redirectTo(reply, `${PATHS.consultantCra}/${params.value.period}`);
    },
  );

  // ── The pré-facturier, and the reveal behind it ───────────────────────────

  app.get(
    PATHS.preFacturier,
    { config: { access: forRoles('manager', 'billing') } },
    async (request, reply) => {
      const query = parseInput(PeriodFilter, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);
      // One question for the clock, and only one: has the month ended? (ADR-0054.) An IsoDate
      // compares lexicographically, which is why no Date arithmetic appears here.
      const today = isoDateInFirmTimeZone(dependencies.clock.now());

      const view = await dependencies.transactionally(async (unit) => {
        const recent = await unit.cras.list({ actor, limit: MAX_MONTHS, offset: 0 });
        const period = query.value.periode ?? offeredPeriods(recent)[0] ?? null;
        // The month asked for is offered even when this office has no Cra in it. A picker that
        // dropped the current selection would answer a shared link by silently showing another
        // month, and BUILD-PLAN 6.6 makes every view shareable by URL.
        const offered = offeredPeriods(period === null ? recent : [...recent, { period }]);

        if (period === null) {
          return {
            period: null,
            offeredPeriods: [],
            billable: [],
            cras: [],
            lateHalfDays: 0,
            periodClosed: false,
            mayDecide: carries(DECIDES_CRA, actor.role),
          };
        }

        const cras = await unit.cras.list({ actor, limit: MAX_MONTHS, offset: 0, period });
        const declined = await unit.invoices.findDeclinedDays(
          cras.map((cra) => cra.id),
          actor,
        );
        const invoices = await unit.invoices.list({
          actor,
          limit: MAX_MONTHS,
          offset: 0,
          period,
        });

        const reference = new PgReferenceReader(unit.client);
        const consultantNames = await reference.consultantNames();
        const missionNames = await reference.missionNames();

        // One read per invoice, and the totals come off the aggregate rather than out of a `SUM`
        // (ADR-0053): a draft's `total_ttc_cents` column is NULL by design, and VAT is rounded
        // once per rate in the domain — a total assembled in SQL would be a different number.
        const billable = [];
        for (const item of invoices) {
          const invoice = await unit.invoices.findById(item.id, actor);
          if (invoice === null) continue;

          billable.push({
            invoiceId: invoice.id,
            clientName: invoice.billedTo.name,
            status: invoice.status,
            invoiceNumber: invoice.number,
            totalExcludingVatCents: invoice.totals.totalExcludingVatCents,
            totalIncludingVatCents: invoice.totals.totalIncludingVatCents,
          });
        }

        const periodClosed = lastDayOf(periodFromIso(period)) < today;

        const rows: CraRow[] = cras.map((cra) => {
          const status = cra.status as CraStatus;

          return {
            craId: cra.id,
            consultantId: cra.consultantId,
            consultantName: consultantNames.get(cra.consultantId) ?? cra.consultantId,
            status,
            recordedHalfDays: cra.recordedHalfDays,
            blocking: blockingOf(cra, status, declined, missionNames),
          };
        });

        return {
          period,
          offeredPeriods: offered,
          billable,
          cras: rows,
          // ADR-0054: half-days of a closed month that have not reached `Validated`. Summed over
          // the rows the repository already scoped, so there is no second place the office rule
          // could be forgotten.
          lateHalfDays: periodClosed
            ? rows
                .filter((row) => row.status !== 'validated')
                .reduce((total, row) => total + row.recordedHalfDays, 0)
            : 0,
          periodClosed,
          // The navigational echo of the route's own declaration, and now literally that
          // declaration: `billing` reads this table and decides nothing on it, and `POST` refuses
          // it whatever renders.
          mayDecide: carries(DECIDES_CRA, actor.role),
        };
      });

      return sendPage(reply, preFacturierPage(view, personaFor(request)));
    },
  );

  /**
   * The month as a printable record (ADR-0056). All three roles may attempt it; the repository is
   * what narrows it — a consultant to their own month, a manager and billing to their office's.
   */
  app.get(
    `${PATHS.craPrint}/:id`,
    { config: { access: forRoles('consultant', 'manager', 'billing') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);

      const view = await dependencies.transactionally(async (unit) => {
        const cra = await unit.cras.findById(params.value.id, actor);
        if (cra === null) return null;

        const reference = new PgReferenceReader(unit.client);

        return {
          craId: cra.id,
          consultantName:
            (await reference.consultantNames()).get(cra.consultantId) ?? cra.consultantId,
          officeName: (await reference.officeNames()).get(cra.officeId) ?? cra.officeId,
          period: periodToIso(cra.period),
          status: cra.status,
          lines: cra.lines,
          flags: cra.flags,
          validatedBy: cra.validatedBy,
          // A `timestamptz` read as the day it fell on in `Europe/Paris`. A record signed by a
          // client carries a date, not an instant, and the conversion belongs where the timezone
          // is known rather than in the formatter.
          validatedAt: cra.validatedAt === null ? null : isoDateInFirmTimeZone(cra.validatedAt),
          missionNames: await reference.missionNames(),
        };
      });

      if (view === null) {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.notFound,
          title: 'No such Cra',
          status: NOT_FOUND,
          detail: 'This Cra does not exist, or has never existed.',
          ...contextOf(request),
        });
      }

      return sendPage(reply, craPrintPage(view, personaFor(request)));
    },
  );

  /**
   * One invoice, draft or issued, as the printable document of ADR-0055.
   *
   * `manager` and `billing` alike, matching `GET /api/v1/invoices/:id`: the repository is what
   * decides which office's invoices either of them may see, and the route only says the action is
   * theirs to attempt (ADR-0023). A consultant is refused here — what their days are worth to the
   * firm is not theirs to read (ADR-0003).
   */
  app.get(
    `${PATHS.invoice}/:id`,
    { config: { access: forRoles('manager', 'billing') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const actor = requireActor(request);
      const invoice = await dependencies.transactionally((unit) =>
        unit.invoices.findById(params.value.id, actor),
      );

      if (invoice === null) {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.notFound,
          title: 'No such invoice',
          status: NOT_FOUND,
          detail: 'This invoice does not exist, or has never existed.',
          ...contextOf(request),
        });
      }

      return sendPage(
        reply,
        invoicePage(
          {
            invoice,
            // A draft has no issue date, so it has no due date: the term runs from the date the
            // document leaves, and a draft has not left.
            dueDate: invoice.issueDate === null ? null : invoice.dueDateFrom(invoice.issueDate),
            // Minted here rather than on the form's own route, because the key has to exist
            // before the submission it identifies (ADR-0059). `null` for a manager, who may read
            // this document and not issue it.
            issuanceKey: carries(ISSUES_INVOICE, actor.role) ? dependencies.newId() : null,
          },
          personaFor(request),
        ),
      );
    },
  );

  /**
   * The reveal (ADR-0052). A screen and not a link into `/api/v1`, because `representationOf`
   * serves everything under `/api/` as `problem+json`.
   *
   * It is declared for `manager` alone, and the pré-facturier links to it for `billing` too. That
   * is deliberate: `economics` is `none` for billing (ADR-0023), so following the link is a 403
   * naming the rule, rendered as a page. BUILD-PLAN's phase-6 row asks for exactly that — "the
   * refusal reason shown, not a greyed-out button".
   */
  app.get(
    `${PATHS.margin}/:consultantId`,
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(ConsultantParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const query = parseInput(PeriodFilter, request.query);
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const periode = query.value.periode;
      if (periode === undefined) {
        return sendProblem(reply, malformed({ periode: ['required'] }, contextOf(request)));
      }

      const actor = requireActor(request);
      const economics = await dependencies.transactionally((unit) =>
        consultantEconomics(
          { client: unit.client, cras: unit.cras, log: request.log },
          { consultantId: params.value.consultantId, period: periodFromIso(periode), actor },
        ),
      );

      if (economics === null) {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.notFound,
          title: 'No such economics record',
          status: NOT_FOUND,
          detail: 'This consultant has no Cra for this month.',
          ...contextOf(request),
        });
      }

      return sendPage(reply, marginPage(economics, personaFor(request)));
    },
  );

  // ── The three verbs of the chain, on screen (ADR-0059) ────────────────────

  app.post(
    `${PATHS.validateCra}/:id`,
    { config: { access: DECIDES_CRA } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const from = parseInput(ActedFrom, request.body);
      if (!from.ok) return sendProblem(reply, malformed(from.errors, contextOf(request)));

      // The same function `/api/v1` calls, so the transaction, the event and the drafted invoices
      // are the same ones — there is no second validation to keep in step. A replay answers with
      // the first result (ADR-0021), which is why no key is needed here.
      const outcome = await validateCraAndDraftInvoices(
        {
          transactionally: dependencies.transactionally,
          clock: dependencies.clock,
          newId: dependencies.newId,
        },
        { craId: params.value.id, actor: requireActor(request), correlationId: request.id },
      );

      if (outcome.kind === 'notFound') return sendProblem(reply, craNotFound(request));

      return redirectTo(reply, backToPreFacturier(from.value.periode));
    },
  );

  app.post(
    `${PATHS.refuseCra}/:id`,
    { config: { access: DECIDES_CRA } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const body = parseInput(Refusal, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const outcome = await refuseCra(
        { transactionally: dependencies.transactionally, clock: dependencies.clock },
        {
          craId: params.value.id,
          actor: requireActor(request),
          reason: body.value.reason,
        },
      );

      if (outcome.kind === 'notFound') return sendProblem(reply, craNotFound(request));

      return redirectTo(reply, backToPreFacturier(body.value.periode));
    },
  );

  /**
   * Issuance, from the invoice page. The `Idempotency-Key` that `/api/v1` takes as a header
   * travels here as a hidden field, because a form cannot set a header and ADR-0009 leaves no
   * script to set one (ADR-0059). It reaches the same `issueInvoice` either way.
   */
  app.post(
    `${PATHS.issueInvoice}/:id`,
    { config: { access: ISSUES_INVOICE } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));

      const body = parseInput(Issuance, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const outcome = await issueInvoice(
        { transactionally: dependencies.transactionally, clock: dependencies.clock },
        {
          invoiceId: params.value.id,
          actor: requireActor(request),
          idempotencyKey: body.value.idempotencyKey,
        },
      );

      if (outcome.kind === 'notFound') {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.notFound,
          title: 'No such invoice',
          status: NOT_FOUND,
          detail: 'This invoice does not exist, or has never existed.',
          ...contextOf(request),
        });
      }

      if (outcome.kind === 'keyReused') {
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.idempotencyKeyReused,
          title: 'Idempotency-Key already used on another invoice',
          status: CONFLICT,
          invariant: API_PROBLEM_TYPES.idempotencyKeyReused,
          detail:
            'This key has already issued a different document. Reload the invoice to obtain a ' +
            'fresh one.',
          deniedBy: API_PROBLEM_TYPES.idempotencyKeyReused,
          ...contextOf(request),
        });
      }

      // Back to the document, which now carries its number and its date.
      return redirectTo(reply, `${PATHS.invoice}/${params.value.id}`);
    },
  );

  /**
   * Clearing a persona is a **POST**, where `/api/v1/session/persona` uses `DELETE`. Not an
   * inconsistency: an HTML form can only issue `GET` and `POST`, and the alternatives are a
   * method-override parameter (a hidden second routing table) or a script (ADR-0009 says there is
   * none). A `GET` would be worse than either — a link that logs you out is a link a prefetcher
   * follows.
   */
  app.post(
    PATHS.clearPersona,
    { config: { access: PUBLIC('clearing a persona needs no persona') } },
    (_request, reply) =>
      redirectTo(reply.header('set-cookie', clearedPersonaCookie(dependencies.config)), PATHS.home),
  );
}
