import { isoDateInFirmTimeZone } from '@erp/platform';
import type { FastifyInstance } from 'fastify';

import type { ServerDependencies } from '../dependencies.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import {
  assignmentCatalogue,
  createAssignment,
  updateAssignment,
} from '../staffing/assignment-admin.ts';
import { malformed, parseInput } from '../validation.ts';

import { AssignmentBody, assignmentRefusal, IdParam, notFound } from './schemas.ts';

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
