import type { ProblemDetails } from '@erp/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { uuidv7 } from '../ids/uuidv7.ts';

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

export function sendProblem(reply: FastifyReply, problem: ProblemDetails): FastifyReply {
  return reply.code(problem.status).type(PROBLEM_JSON).send(problem);
}
