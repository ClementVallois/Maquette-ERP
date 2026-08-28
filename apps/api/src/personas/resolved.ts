import type { FastifyRequest } from 'fastify';

import type { Persona } from './catalogue.ts';

/**
 * The persona a request resolved to, associated with the request rather than written onto it. A
 * `WeakMap` keeps the request object exactly as the framework built it — nothing downstream can
 * mistake a decoration for something the client sent — and the entry disappears with the request.
 *
 * It lives in its own module, apart from the access control that fills it, for a mechanical reason:
 * `http/reply.ts` has to know who is asking in order to render a refusal as a page with the persona
 * bar on it, and `personas/access.ts` imports `http/reply.ts` to send that refusal. One module
 * holding both would be a cycle, which `import-x/no-cycle` refuses.
 */
const resolved = new WeakMap<FastifyRequest, Persona>();

export function rememberPersona(request: FastifyRequest, persona: Persona): void {
  resolved.set(request, persona);
}

export function personaFor(request: FastifyRequest): Persona | undefined {
  return resolved.get(request);
}
