import { API_PROBLEM_TYPES } from '@erp/contracts';
import type { Actor, Role } from '@erp/platform';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { ServerDependencies } from '../dependencies.ts';
import { ApiFailure } from '../errors.ts';
import { contextOf, sendProblem } from '../http/reply.ts';

import { actorOf } from './catalogue.ts';
import { PERSONA_COOKIE, readCookie, unsignPersonaKey } from './cookie.ts';
import { personaFor, rememberPersona } from './resolved.ts';

/**
 * The third locus of authorization (ADR-0023): **does this actor's role carry this action at
 * all?** The repository decides which records an actor may see and the domain decides whether they
 * may act given who acted before them; neither can express "a consultant may not attempt an
 * issuance", and this is where that is said.
 *
 * It is said **once per route, as data**: the `onRoute` hook below throws while the server is
 * being built if a route carries no `Access`, so an undeclared route cannot be served rather than
 * being served open. That is what makes this a declaration and not an `if` scattered through
 * handlers — it is greppable, it is enumerable, and forgetting it is loud.
 */

export type Access =
  | { readonly kind: 'public'; readonly why: string }
  | { readonly kind: 'roles'; readonly roles: readonly Role[] };

export const PUBLIC = (why: string): Access => ({ kind: 'public', why });
export const forRoles = (...roles: Role[]): Access => ({ kind: 'roles', roles });

/**
 * Does this declaration carry this role? The `preHandler` below asks it to refuse a request; a
 * screen asks it to decide whether to offer the button at all. Both readings come off the **same**
 * `Access` value, so a verb that moves between roles moves its button with it — a screen may never
 * answer that question by comparing a role itself.
 */
export function carries(access: Access, role: Role): boolean {
  return access.kind === 'public' || access.roles.includes(role);
}

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
  }
}

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

/**
 * The actor a handler runs as. It throws rather than returning `undefined` because the hook below
 * has already refused every request that would reach a handler without one — so an absence here
 * is a wiring fault, not a request the caller can fix.
 */
export function requireActor(request: FastifyRequest): Actor {
  const persona = personaFor(request);
  if (persona === undefined) {
    throw new ApiFailure(`${request.url} ran without a persona; its Access declaration is wrong`);
  }

  return actorOf(persona);
}

export function registerAccessControl(
  app: FastifyInstance,
  dependencies: ServerDependencies,
): void {
  // "A route registered without a declaration fails to register" (ADR-0023), literally: this
  // throws while the server is being built, so the process never starts serving it.
  app.addHook('onRoute', (route) => {
    if (route.config?.access === undefined) {
      throw new ApiFailure(
        `${route.method.toString()} ${route.url} declares no Access. Every route says which roles ` +
          'carry it, or that it is public and why — see docs/adr/0023.',
      );
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    const access = request.routeOptions.config.access;

    // Resolution is attempted on every route, enforcement only on the guarded ones. A public
    // route still wants to know who is asking — `GET /api/v1/session` exists to answer exactly
    // that — and a broken cookie must not lock a visitor out of the selector that would fix it.
    const signed = readCookie(request.headers.cookie, PERSONA_COOKIE);
    const key =
      signed === null ? null : unsignPersonaKey(signed, dependencies.config.sessionSigningKey);
    const persona = key === null ? null : await dependencies.personas.byKey(key);

    if (persona !== null) rememberPersona(request, persona);

    if (access === undefined || access.kind === 'public') return;

    if (signed === null) {
      await sendProblem(reply, {
        type: API_PROBLEM_TYPES.noPersona,
        title: 'No persona selected',
        status: UNAUTHORIZED,
        detail: 'Select a persona first: POST /api/v1/session/persona.',
        ...contextOf(request),
      });

      return;
    }

    if (persona === null) {
      // A tampered signature and a key this instance does not offer answer the same way: telling
      // them apart would say which half the caller got right.
      request.log.warn('a persona cookie was presented that this instance does not recognise');
      await sendProblem(reply, {
        type: API_PROBLEM_TYPES.unknownPersona,
        title: 'Unknown persona',
        status: FORBIDDEN,
        detail: 'The persona cookie does not name a persona this instance offers.',
        deniedBy: API_PROBLEM_TYPES.unknownPersona,
        ...contextOf(request),
      });

      return;
    }

    if (!access.roles.includes(persona.role)) {
      await sendProblem(reply, {
        type: API_PROBLEM_TYPES.insufficientRole,
        title: 'This role does not carry this action',
        status: FORBIDDEN,
        detail: `The action is carried by ${access.roles.join(', ')}.`,
        deniedBy: API_PROBLEM_TYPES.insufficientRole,
        ...contextOf(request),
      });

      return;
    }
  });
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF, second control (ADR-0023). `SameSite=Strict` on the cookie is the first; this one closes
 * the gap for any client that does not honour it.
 *
 * A **missing** `Origin` is refused as well as a mismatched one. Browsers send it on every
 * cross-site state-changing request, so accepting its absence would re-open the hole for exactly
 * the requests the check exists to stop. The cost is that `curl -X POST` needs the header, and
 * `docs/demo.md` says so at the point where someone would hit it.
 */
export function registerOriginCheck(app: FastifyInstance, dependencies: ServerDependencies): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!STATE_CHANGING.has(request.method)) return;

    const origin = request.headers.origin;
    if (origin === dependencies.config.publicOrigin) return;

    request.log.warn(
      { originPresent: origin !== undefined },
      'a state-changing request was refused on its origin',
    );

    await sendProblem(reply, {
      type: API_PROBLEM_TYPES.forbiddenOrigin,
      title: 'Origin not allowed',
      status: FORBIDDEN,
      detail:
        'A state-changing request must carry an Origin header equal to this instance origin. ' +
        'A missing Origin is refused too.',
      deniedBy: API_PROBLEM_TYPES.forbiddenOrigin,
      ...contextOf(request),
    });
  });
}
