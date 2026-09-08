import { periodFromIso } from '@erp/platform';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ServerDependencies } from '../dependencies.ts';
import { consultantEconomics } from '../economics/consultant-economics.ts';
import { contextOf, sendProblem } from '../http/reply.ts';
import { forRoles, requireActor } from '../personas/access.ts';
import { malformed, parseInput } from '../validation.ts';

import { notFound, PeriodQuery } from './schemas.ts';

const ConsultantParams = z.object({ consultantId: z.string().min(1).max(64) });

/**
 * Its own registrar rather than a corner of `pre-facturier.ts`: the economics endpoint belongs to
 * neither that resource nor any other, and its only caller is `apps/web/src/features/marge/api.ts`.
 */
export function registerEconomicsRoutes(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  app.get(
    '/api/v1/consultants/:consultantId/economics',
    { config: { access: forRoles('manager') } },
    async (request, reply) => {
      const params = parseInput(ConsultantParams, request.params);
      const query = parseInput(PeriodQuery, request.query);
      if (!params.ok) return sendProblem(reply, malformed(params.errors, contextOf(request)));
      if (!query.ok) return sendProblem(reply, malformed(query.errors, contextOf(request)));

      const actor = requireActor(request);
      // The disclosure log lives inside `consultantEconomics` (ADR-0052), not here: this route and
      // the `/marge` screen serve the same record, and a control written once per handler is a
      // control the second handler forgets.
      const economics = await dependencies.transactionally((unit) =>
        consultantEconomics(
          { client: unit.client, cras: unit.cras, log: request.log },
          {
            consultantId: params.value.consultantId,
            period: periodFromIso(query.value.period),
            actor,
          },
        ),
      );

      if (economics === null) return sendProblem(reply, notFound(request, 'economics record'));

      return economics;
    },
  );
}
