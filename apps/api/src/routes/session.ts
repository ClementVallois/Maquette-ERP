import { API_PROBLEM_TYPES } from '@erp/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { PUBLIC } from '../personas/access.ts';
import type { Persona } from '../personas/catalogue.ts';
import { clearedPersonaCookie, personaCookie } from '../personas/cookie.ts';
import { personaFor } from '../personas/resolved.ts';
import { malformed, parseInput } from '../validation.ts';

/**
 * Choosing a persona (ADR-0023). All three routes are public, and the reason is the same in each
 * case: the selector has to be usable *before* an identity exists, which is the whole point of it
 * replacing a login screen.
 */

const SelectPersona = z.object({ key: z.string().min(1).max(64) });

const NOT_FOUND = 404;

function view(persona: Persona): Record<string, string> {
  return {
    key: persona.key,
    role: persona.role,
    displayName: persona.displayName,
    office: persona.officeName,
  };
}

export function registerSessionRoutes(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  app.get(
    '/api/v1/personas',
    { config: { access: PUBLIC('the selector must render before a persona is chosen') } },
    async () => {
      const personas = await dependencies.personas.list();

      return {
        // Said in the payload and not only in the README: a client that only ever reads this
        // route still learns that none of this is authentication. French: this is the only
        // copy of the notice rendered to a visitor (item 1, QA round 1) — the selector used to
        // also show a French paragraph of its own, which duplicated this idea and was dropped.
        notice:
          'Cette maquette n’a pas d’authentification : on choisit une identité, et tout le ' +
          'monde peut choisir n’importe laquelle.',
        personas: personas.map(view),
      };
    },
  );

  app.get(
    '/api/v1/session',
    { config: { access: PUBLIC('answers "which persona am I", including when there is none') } },
    (request) => {
      const persona = personaFor(request);

      return { persona: persona === undefined ? null : view(persona) };
    },
  );

  app.post(
    '/api/v1/session/persona',
    { config: { access: PUBLIC('choosing a persona is how an identity is acquired at all') } },
    async (request, reply) => {
      const body = parseInput(SelectPersona, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const persona = await dependencies.personas.byKey(body.value.key);
      if (persona === null) {
        // A key that does not exist is a 404 and not a 403: nothing is being refused, the thing
        // asked for is not there, and the catalogue that lists what is there is public.
        return sendProblem(reply, {
          type: API_PROBLEM_TYPES.notFound,
          title: 'No such persona',
          status: NOT_FOUND,
          detail: 'GET /api/v1/personas lists the personas this instance offers.',
          ...contextOf(request),
        });
      }

      return reply
        .header('set-cookie', personaCookie(persona.key, dependencies.config))
        .send({ persona: view(persona) });
    },
  );

  app.delete(
    '/api/v1/session/persona',
    { config: { access: PUBLIC('clearing a persona needs no persona') } },
    (_request, reply) =>
      reply.header('set-cookie', clearedPersonaCookie(dependencies.config)).send({ persona: null }),
  );
}
