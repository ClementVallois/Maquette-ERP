import { API_PROBLEM_TYPES } from '@erp/contracts';
import type { FastifyInstance } from 'fastify';

import type { ServerDependencies } from '../dependencies.ts';
import { sendProblem } from '../http/reply.ts';

/**
 * Liveness and readiness, deliberately two routes and not one.
 *
 * `/healthz` answers whether the process is alive and **depends on nothing**: if it probed the
 * database, a database outage would make an orchestrator kill and restart a process that was
 * working fine, turning a recoverable outage into a crash loop.
 *
 * `/readyz` answers whether the process can serve traffic, which for this application means the
 * database answers. It is the one that a load balancer takes out of rotation on.
 */

const SERVICE_UNAVAILABLE = 503;

export function registerOpsRoutes(app: FastifyInstance, dependencies: ServerDependencies): void {
  app.get('/healthz', (_request, reply) => reply.send({ status: 'ok' }));

  app.get('/readyz', async (request, reply) => {
    try {
      await dependencies.probeDatabase();
    } catch (error) {
      request.log.warn({ err: error }, 'readiness probe failed');

      return sendProblem(reply, {
        type: API_PROBLEM_TYPES.databaseUnavailable,
        title: 'Not ready',
        status: SERVICE_UNAVAILABLE,
        detail: 'The database did not answer.',
        instance: request.url,
        correlationId: request.id,
      });
    }

    return reply.send({ status: 'ready' });
  });
}
