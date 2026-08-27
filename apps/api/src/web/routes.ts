import { API_PROBLEM_TYPES, type ProblemDetails } from '@erp/contracts';
import { isoDateInFirmTimeZone, periodFromIso, periodToIso } from '@erp/platform';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { issueInvoice } from '../chain/issue-invoice.ts';
import { type QuarterDayEntry, recordMonth } from '../chain/record-month.ts';
import { refuseCra } from '../chain/refuse-cra.ts';
import { validateCraAndDraftInvoices } from '../chain/validate-cra.ts';
import { DECIDES_CRA } from '../composition/pre-facturier.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { carries, forRoles, PUBLIC, requireActor } from '../personas/access.ts';
import { clearedPersonaCookie, personaCookie } from '../personas/cookie.ts';
import { personaFor } from '../personas/resolved.ts';
import { malformed, parseInput } from '../validation.ts';

import { STYLESHEET } from './assets.ts';
import { craPrintPage } from './pages/cra-print.ts';
import { invoicePage } from './pages/invoice.ts';
import { PATHS } from './paths.ts';
import { redirectTo, sendPage } from './reply.ts';

/**
 * The two printable documents (ADR-0056, ADR-0055) and the write verbs behind the chain
 * (ADR-0048: they share this deployable with `/api/v1`, and the two differ by a directory and a
 * content type, not by a boundary).
 *
 * Every route here declares its `Access` exactly as an API route does, goes through the same origin
 * check, and refuses through the same `sendProblem` — which renders the refusal as a page because
 * of the path it is on, not because this file did anything special.
 *
 * The interactive screens this file used to render (the persona selector, the Cra list and grid,
 * the pré-facturier, the margin reveal) are gone — front-end plan Phase 9.3, once ADR-0062 moved
 * them into `apps/web`'s SPA. What is left is what stays server-rendered on purpose: a document
 * meant to be printed or read as a record, and the write verbs a form (or, since Phase 9, a direct
 * HTTP client) still carries.
 */

const NOT_FOUND = 404;
const CONFLICT = 409;
const NOT_MODIFIED = 304;
/**
 * What one slot of this form is worth, in the storage unit (ADR-0069). This screen keeps its
 * two-slot morning/afternoon shape — ADR-0070's matrix is `apps/web`'s, not this one's — so a
 * slot stays worth half a day, now spelled as two quarter-days rather than one half-day.
 */
const SLOT_QUARTER_DAYS = 2;

/**
 * The declarations the verbs are registered with, named because a **screen reads them too**
 * (ADR-0023). A button that offers an action asks the action's own `Access` whether this role
 * carries it, through `carries` — so the offer cannot drift from the refusal, and moving a verb
 * between roles moves its button in the same edit. `routes.test.ts` proves the route each one is
 * registered on is the route the screen asks about.
 *
 * `DECIDES_CRA` lives in `../composition/pre-facturier.ts` now — the pré-facturier's own
 * `mayDecide` field and these two routes' access both read the one declaration.
 */
export const ISSUES_INVOICE = forRoles('billing');

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
 * What the grid posts (ADR-0050): one field per slot, named `YYYY-MM-DD:0` or `:1`, whose value is
 * `''`, `absence`, or a mission id — plus which button was pressed. Each slot is worth
 * `SLOT_QUARTER_DAYS` quarter-days (ADR-0069).
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

/**
 * The query key on the way out is `period`, not `periode` — the incoming form field this reads
 * from (`Refusal`/`ActedFrom`'s `periode`, ADR-0026's French screen vocabulary) and the SPA
 * route's own search param (`apps/web/src/routes/_shell/pre-facturier.tsx`, task 7.1) are two
 * different things read by two different code bases, and only the second one is who now answers
 * `GET /pre-facturier` (Phase 9.3's SPA fallback). Sending `periode` here would silently lose the
 * period on redirect: the SPA reads `search.period`, sees it undefined, and falls back to the
 * office's most recent month instead of the one this refusal or validation was decided from.
 */
function backToPreFacturier(periode: string | undefined): string {
  return periode === undefined ? PATHS.preFacturier : `${PATHS.preFacturier}?period=${periode}`;
}

/**
 * The posted form, read back into quarter-day entries. Anything that is not a slot field is
 * ignored rather than refused: the same body carries the `action` button, and a browser adds
 * fields nobody asked for.
 *
 * Each slot is worth `SLOT_QUARTER_DAYS`: this form's granularity did not change, only the unit it
 * is spelled in. Two slots naming the same mission on the same day are two entries of the same
 * triplet — `linesOf` in `record-month.ts` sums them into one line of a full day (ADR-0069/0070),
 * where the old model relied on `recordDay` accepting two identical half-day lines directly.
 */
function entriesOf(body: Record<string, unknown>): QuarterDayEntry[] {
  const entries: QuarterDayEntry[] = [];

  for (const [name, raw] of Object.entries(body)) {
    const match = SLOT_FIELD.exec(name);
    if (match === null || typeof raw !== 'string' || raw === '') continue;

    const [, day = ''] = match;
    entries.push(
      raw === 'absence'
        ? { day, dayType: 'absence', missionId: null, quarterDays: SLOT_QUARTER_DAYS }
        : { day, dayType: 'worked', missionId: raw, quarterDays: SLOT_QUARTER_DAYS },
    );
  }

  return entries;
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

  // `GET /` no longer renders here: the SPA fallback (server.ts, front-end plan Phase 9.1) serves
  // it, and the SPA is itself the persona selector now. This route registration is gone, not
  // dead-code-eliminated — `PATHS.home` stays defined, still the redirect target below and in
  // problem-page.ts (`ADR-0061`'s "back to safety" link, correct either way: the SPA renders `/`).

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
  //
  // The two GET screens that used to live here (the list, the grid) are gone — the SPA renders
  // `/cra` and `/cra/$period` instead (Phase 9.3). `POST` stays: it is the action the grid's save
  // and submit buttons used to carry, still registered and still driving `recordMonth`, and still
  // untouched by the split day / non-slot-field / replace-not-merge coverage that stays for it
  // (routes.test.ts references it as `PATHS.consultantCra`, unchanged).

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

      // Back to the grid — but the grid is the SPA's now (`/cra/$period`, not
      // `PATHS.consultantCra`'s own `/consultant/cra/:period`, which no route answers since
      // Phase 9.3). A refusal never reaches here: it is thrown, and `sendProblem` renders it as a
      // page carrying the same typed reason the API would have returned.
      return redirectTo(reply, `${PATHS.spaCra}/${params.value.period}`);
    },
  );

  // ── The pré-facturier ──────────────────────────────────────────────────────
  //
  // The GET screen (rendered composition, the "reveal" margin screen behind it) is gone — the SPA
  // renders `/pre-facturier` and `/marge/$consultantId` instead (Phase 9.3). `DECIDES_CRA`, from
  // the same module as the now-unused `preFacturierComposition`, is what the two POST verbs below
  // still need.

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

  // The reveal (ADR-0052) is gone too — the SPA renders `/marge/$consultantId` and reads
  // `/api/v1/consultants/:id/economics` (or its equivalent) directly, same disclosure log
  // (ADR-0052) and same 403-naming-the-rule refusal for billing, now through the JSON route
  // rather than a rendered page.

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
