import type { ProblemDetails } from '@erp/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { uuidv7 } from '../ids/uuidv7.ts';
import { personaFor } from '../personas/resolved.ts';
import { problemPage } from '../web/problem-page.ts';
import { renderToString } from '../web/render/html.ts';
import { HTML } from '../web/reply.ts';
import { representationOf } from '../web/representation.ts';

import { PROBLEM_JSON, type ProblemContext } from './problem.ts';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * A correlation id supplied by the caller is accepted only in this shape. Echoing an arbitrary
 * header into every log line of a request is how a newline gets into a log file, and this
 * instance is public.
 */
const SUPPLIED_CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function correlationIdOf(supplied: unknown): string {
  return typeof supplied === 'string' && SUPPLIED_CORRELATION_ID.test(supplied)
    ? supplied
    : uuidv7();
}

export function contextOf(request: FastifyRequest): ProblemContext {
  return { instance: request.url, correlationId: request.id };
}

/**
 * The single exit for every refusal in this application — the access hook, the origin check, the
 * routes, the error handler and the 404 handler all end here.
 *
 * That is what lets the screens and the API answer with the **same object** rather than with two
 * error vocabularies (ADR-0009 § Consequences promised exactly this). A screen does not re-derive
 * a message from a status code: it renders the `ProblemDetails` the API would have returned, so a
 * refusal a reader sees on a page and the one a `curl` reproduces are the same refusal, down to the
 * `deniedBy` naming which of ADR-0023's three loci said no.
 *
 * The representation is chosen from the path (`web/representation.ts`), never from `Accept`.
 */
export function sendProblem(reply: FastifyReply, problem: ProblemDetails): FastifyReply {
  if (representationOf(reply.request.url) === 'html') {
    return reply
      .code(problem.status)
      .type(HTML)
      .send(renderToString(problemPage(problem, personaFor(reply.request))));
  }

  return reply.code(problem.status).type(PROBLEM_JSON).send(problem);
}
