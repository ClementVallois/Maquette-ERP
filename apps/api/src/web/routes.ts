import { API_PROBLEM_TYPES } from '@erp/contracts';
import { daysOf, periodFromIso } from '@erp/platform';
import { type CraLine, workingCalendar } from '@erp/timesheet';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { type HalfDayEntry, recordMonth } from '../chain/record-month.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, PUBLIC, requireActor } from '../personas/access.ts';
import { clearedPersonaCookie, personaCookie } from '../personas/cookie.ts';
import { personaFor } from '../personas/resolved.ts';
import { malformed, parseInput } from '../validation.ts';

import { STYLESHEET } from './assets.ts';
import { craGridPage, type GridDay, type SlotValue, totalsOf } from './pages/cra-grid.ts';
import { craListPage } from './pages/cra-list.ts';
import { personaSelectorPage } from './pages/persona-selector.ts';
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
const NOT_MODIFIED = 304;
/** A consultant's whole history fits well inside the repository's hard cap of fifty. */
const MAX_MONTHS = 50;
const SLOTS = [0, 1] as const;

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

    const [, day = '', slot = '0'] = match;
    entries.push(
      raw === 'absence'
        ? { day, slot: slot === '0' ? 0 : 1, dayType: 'absence', missionId: null }
        : { day, slot: slot === '0' ? 0 : 1, dayType: 'worked', missionId: raw },
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

/** The months this consultant has a Cra for, newest first, for the filter dropdown. */
function offeredPeriods(cras: readonly { period: string }[]): string[] {
  return [...new Set(cras.map((cra) => cra.period))].sort((left, right) =>
    right.localeCompare(left),
  );
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
          detail: "Ce persona n'existe pas sur cette instance.",
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
