import { isoDateInFirmTimeZone } from '@erp/platform';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import {
  assignmentCatalogue,
  createAssignment,
  type AssignmentWriteOutcome,
  updateAssignment,
} from '../staffing/assignment-admin.ts';
import { malformed, parseInput } from '../validation.ts';

import { CONFLICT, IdParam, notFound } from './schemas.ts';

const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const AssignmentBody = z.object({
  consultantId: z.string().min(1).max(64),
  missionId: z.string().min(1).max(64),
  fromDate: IsoDateString,
  toDate: IsoDateString.nullable().default(null),
});

function assignmentRefusal(
  request: FastifyRequest,
  outcome: Extract<AssignmentWriteOutcome, { kind: 'refused' }>,
) {
  return {
    type: outcome.problemType,
    title: 'Assignment refused',
    status: CONFLICT,
    invariant: outcome.problemType,
    errors: Object.fromEntries(
      Object.entries(outcome.details).map(([field, value]) => [field, [value]]),
    ),
    ...contextOf(request),
  };
}

export function registerAssignmentRoutes(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  app.get('/api/v1/assignments', { config: { access: forRoles('manager') } }, async (request) => {
    const actor = requireActor(request);
    const today = isoDateInFirmTimeZone(dependencies.clock.now());
    return dependencies.transactionally((unit) => assignmentCatalogue(unit.client, actor, today));
  });

  app.post(
    '/api/v1/assignments',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const body = parseInput(AssignmentBody, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const outcome = await dependencies.transactionally((unit) =>
        createAssignment(unit.client, requireActor(request), dependencies.newId, body.value),
      );
      if (outcome.kind === 'notFound') {
        return sendProblem(reply, notFound(request, 'consultant or mission'));
      }
      if (outcome.kind === 'refused') {
        return sendProblem(reply, assignmentRefusal(request, outcome));
      }
      return reply.code(201).send(outcome);
    },
  );

  app.put(
    '/api/v1/assignments/:id',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(IdParam, request.params);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));
      const body = parseInput(AssignmentBody, request.body);
      if (!body.ok) return sendProblem(reply, malformed(body.errors, contextOf(request)));

      const outcome = await dependencies.transactionally((unit) =>
        updateAssignment(unit.client, requireActor(request), params.value.id, body.value),
      );
      if (outcome.kind === 'notFound') return sendProblem(reply, notFound(request, 'assignment'));
      if (outcome.kind === 'refused') {
        return sendProblem(reply, assignmentRefusal(request, outcome));
      }
      return reply.code(200).send(outcome);
    },
  );
}
