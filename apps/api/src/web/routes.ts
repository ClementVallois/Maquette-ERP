import { API_PROBLEM_TYPES } from '@erp/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PUBLIC } from '../personas/access.ts';
import { clearedPersonaCookie, personaCookie } from '../personas/cookie.ts';
import { personaFor } from '../personas/resolved.ts';
import { malformed, parseInput } from '../validation.ts';

import { STYLESHEET } from './assets.ts';
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
const SelectPersona = z.object({ key: z.string().min(1).max(64) });

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
