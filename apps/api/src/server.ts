import { API_PROBLEM_TYPES } from '@erp/contracts';
import Fastify, { type FastifyInstance } from 'fastify';

import type { ServerDependencies } from './dependencies.ts';
import {
  internalProblem,
  isMappedBusinessError,
  problemFromBusinessError,
} from './http/problem.ts';
import { contextOf, CORRELATION_ID_HEADER, correlationIdOf, sendProblem } from './http/reply.ts';
import { loggerOptions } from './logging.ts';
import { registerAccessControl, registerOriginCheck } from './personas/access.ts';
import { registerApiRoutes } from './routes/api.ts';
import { registerOpsRoutes } from './routes/ops.ts';
import { registerSessionRoutes } from './routes/session.ts';
import { registerFormBodyParser } from './web/form-body.ts';
import { registerSecurityHeaders } from './web/reply.ts';
import { representationOf } from './web/representation.ts';
import { registerWebRoutes } from './web/routes.ts';
import { DEFAULT_DIST_DIR, registerSpa, serveSpaShellOrNull } from './web/spa.ts';

/**
 * The HTTP edge. Everything it knows how to do with a failure is turn it into RFC 9457
 * `application/problem+json` — there is no other error shape on the wire, including for the
 * 404 and the 500 Fastify would otherwise answer in its own format.
 */

const NOT_FOUND = 404;
const CLIENT_ERROR_FLOOR = 400;
const SERVER_ERROR_FLOOR = 500;
const BODY_LIMIT_BYTES = 256 * 1024;

/** Fastify puts a status on the failures it raises itself — a body that will not parse, a payload
 * past the limit. Nothing thrown by a module carries one, which is the point of reading it here. */
function statusCarriedBy(failure: unknown): number {
  if (typeof failure !== 'object' || failure === null || !('statusCode' in failure)) {
    return SERVER_ERROR_FLOOR;
  }
  const { statusCode } = failure;

  return typeof statusCode === 'number' ? statusCode : SERVER_ERROR_FLOOR;
}

/**
 * `spaDistDir` defaults to `spa.ts`'s own computed `apps/web/dist` — `main.ts` never passes it.
 * A test passes an explicit, deliberately non-existent path instead of relying on whether a
 * previous `pnpm --filter @erp/web build` happens to have left a real `dist` on the machine
 * running the suite: the same test must answer the same way whether or not that build ran.
 */
export function buildServer(
  dependencies: ServerDependencies,
  spaDistDir: string = DEFAULT_DIST_DIR,
): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions(dependencies.config),
    genReqId: (request) => correlationIdOf(request.headers[CORRELATION_ID_HEADER]),
    // The default is 100 MiB. Nothing this API accepts is larger than a month of quarter-days.
    bodyLimit: BODY_LIMIT_BYTES,
  });

  // A caller cannot match its own report to a log line without being told which chain it was.
  app.addHook('onSend', (request, reply, payload, done) => {
    void reply.header(CORRELATION_ID_HEADER, request.id);
    done(null, payload);
  });

  app.setNotFoundHandler((request, reply) => {
    // The SPA fallback (ADR-0063, front-end plan Phase 9.1): every screen navigation that isn't
    // `/api/*`, an asset, or one of the two printable routes (matched by their own registration,
    // so they never reach here) answers `index.html` instead of this application's own 404 page,
    // and the client-side router takes it from there. `serveSpaShellOrNull` returns `null` when
    // the web app was never built, which is every non-e2e test — the ordinary 404 below is what
    // those get instead.
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (representationOf(request.url) === 'html') {
        const shell = serveSpaShellOrNull(reply, spaDistDir);
        if (shell !== null) return shell;
      }
    }

    void sendProblem(reply, {
      type: API_PROBLEM_TYPES.notFound,
      title: 'No such route',
      status: NOT_FOUND,
      instance: request.url,
      correlationId: request.id,
    });
  });

  app.setErrorHandler((failure: unknown, request, reply) => {
    const context = contextOf(request);
    // The parameter is `unknown` on purpose. Fastify types it as `FastifyError`, which is a lie
    // the moment a handler throws anything else — and every handler here throws a `BusinessError`,
    // which is not one.
    const frameworkStatus = statusCarriedBy(failure);
    const message = failure instanceof Error ? failure.message : '';

    if (isMappedBusinessError(failure)) {
      // Expected, and part of the contract. `info` rather than `error`: a rule refusing is the
      // system working, and logging it at error level trains the reader to ignore the level.
      request.log.info({ err: failure }, 'business rule refused the request');

      return sendProblem(reply, problemFromBusinessError(failure, context));
    }

    // Fastify's own client-side failures: a body that is not JSON, a payload past the limit.
    // They are facts about the request, so the caller is told what happened; nothing about them
    // comes from the domain.
    if (frameworkStatus >= CLIENT_ERROR_FLOOR && frameworkStatus < SERVER_ERROR_FLOOR) {
      request.log.info({ err: failure }, 'malformed request');

      return sendProblem(reply, {
        type: API_PROBLEM_TYPES.malformedRequest,
        title: 'Malformed request',
        status: frameworkStatus,
        detail: message,
        instance: context.instance,
        correlationId: context.correlationId,
      });
    }

    request.log.error({ err: failure }, 'unhandled failure');

    return sendProblem(reply, internalProblem(context));
  });

  // Order matters and is not incidental: `registerAccessControl` installs an `onRoute` hook, and
  // Fastify fires that hook only for routes registered after it. Registering a route first would
  // make it exempt from the declaration check — silently.
  registerSecurityHeaders(app);
  registerFormBodyParser(app);
  registerOriginCheck(app, dependencies);
  registerAccessControl(app, dependencies);

  registerOpsRoutes(app, dependencies);
  registerSessionRoutes(app, dependencies);
  registerApiRoutes(app, dependencies);
  registerWebRoutes(app, dependencies);
  // After registerAccessControl, like every route above: its `onRoute` hook applies to whatever
  // is registered after it runs, and `registerSpa`'s one route declares `PUBLIC` for the same
  // reason every other route here declares something (ADR-0023).
  registerSpa(app, spaDistDir);

  return app;
}
