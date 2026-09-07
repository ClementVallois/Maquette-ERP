import { API_PROBLEM_TYPES } from '@erp/contracts';
import { isoDateInFirmTimeZone, periodToIso } from '@erp/platform';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';
import { forRoles, PUBLIC, requireActor } from '../personas/access.ts';
import { personaFor } from '../personas/resolved.ts';
import { malformed, parseInput } from '../validation.ts';

import { STYLESHEET } from './assets.ts';
import { craPrintPage } from './pages/cra-print.ts';
import { invoicePage } from './pages/invoice.ts';
import { PATHS } from './paths.ts';
import { sendPage } from './reply.ts';

/**
 * The two printable documents (ADR-0056, ADR-0055).
 *
 * Every route here declares its `Access` exactly as an API route does, goes through the same origin
 * check, and refuses through the same `sendProblem` — which renders the refusal as a page because
 * of the path it is on, not because this file did anything special.
 *
 * Interactive screens and every business mutation are served by the SPA and JSON API. What stays
 * server-rendered is a document meant to be printed or read as a record.
 */

const NOT_FOUND = 404;
const NOT_MODIFIED = 304;

const IdParam = z.object({ id: z.string().min(1).max(64) });

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
          },
          personaFor(request),
        ),
      );
    },
  );
}
