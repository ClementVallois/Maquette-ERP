import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import type { ApiConfig } from '../config.ts';
import type { ServerDependencies } from '../dependencies.ts';
import { ApiFailure } from '../errors.ts';
import type { Transactionally } from '../persistence/unit-of-work.ts';
import { buildServer } from '../server.ts';

import { forRoles, PUBLIC } from './access.ts';
import { PERSONA_COOKIE, signPersonaKey } from './cookie.ts';
import { personaFor } from './resolved.ts';
import { inMemoryPersonas } from './testing/catalogue.ts';

const ORIGIN = 'http://localhost:3000';
const SECRET = 'k'.repeat(40);

const config: ApiConfig = {
  databaseUrl: 'postgres://erp_app:pw@localhost:5433/erp',
  host: '127.0.0.1',
  port: 0,
  publicOrigin: ORIGIN,
  sessionSigningKey: SECRET,
  logLevel: 'silent',
};

/** No database in these tests: a route that reaches for one is a route in the wrong test file. */
const noDatabase: Transactionally = () => {
  throw new ApiFailure('this test builds no unit of work');
};

const dependencies: ServerDependencies = {
  config,
  clock: { now: () => new Date('2026-06-15T09:00:00.000Z') },
  probeDatabase: () => Promise.resolve(),
  personas: inMemoryPersonas(),
  transactionally: noDatabase,
  newId: () => 'test-id',
};

function cookieFor(key: string): string {
  return `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}`;
}

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

function serverWithGuardedRoutes(): FastifyInstance {
  const server = buildServer(dependencies);

  server.get('/api/v1/managers-only', { config: { access: forRoles('manager') } }, (request) => ({
    seenBy: personaFor(request)?.key,
    office: personaFor(request)?.officeId,
  }));
  server.get(
    '/api/v1/anyone-signed-in',
    {
      config: { access: forRoles('consultant', 'manager', 'billing') },
    },
    () => ({ ok: true }),
  );
  server.post('/api/v1/managers-write', { config: { access: forRoles('manager') } }, () => ({
    ok: true,
  }));
  server.get('/api/v1/open', { config: { access: PUBLIC('a fixture') } }, (request) => ({
    persona: personaFor(request)?.key ?? null,
  }));

  return server;
}

describe('a route that declares no Access', () => {
  it('cannot be registered at all', () => {
    app = buildServer(dependencies);

    // ADR-0023: "a route registered without a declaration fails to register". This is that,
    // literally — the throw happens while the server is being built, so it never serves.
    expect(() => {
      app.get('/api/v1/undeclared', () => ({ ok: true }));
    }).toThrow(/declares no Access/u);
  });
});

describe('resolving the persona', () => {
  it('refuses a guarded route with 401 when no persona is selected', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({ method: 'GET', url: '/api/v1/managers-only' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ type: '/problems/no-persona' });
  });

  it('refuses a forged cookie with 403, saying no more than that it is unknown', async () => {
    app = serverWithGuardedRoutes();

    const forged = `${PERSONA_COOKIE}=manager-paris.${signPersonaKey('manager-paris', 'wrong-secret-entirely')}`;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/managers-only',
      headers: { cookie: forged },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/unknown-persona' });
  });

  it('answers a forged cookie exactly as it answers an unknown key', async () => {
    // Distinguishing them would tell the caller which half they got right.
    app = serverWithGuardedRoutes();

    const forged = await app.inject({
      method: 'GET',
      url: '/api/v1/managers-only',
      headers: { cookie: `${PERSONA_COOKIE}=manager-paris.tampered-signature-of-the-right-len` },
    });
    const unknown = await app.inject({
      method: 'GET',
      url: '/api/v1/managers-only',
      headers: { cookie: cookieFor('manager-marseille') },
    });

    expect(forged.statusCode).toBe(unknown.statusCode);
    expect(forged.json()).toMatchObject({ type: '/problems/unknown-persona' });
    expect(unknown.json()).toMatchObject({ type: '/problems/unknown-persona' });
  });

  it('admits a persona whose role carries the route', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/managers-only',
      headers: { cookie: cookieFor('manager-lyon') },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ seenBy: 'manager-lyon', office: 'office-lyon' });
  });

  it('refuses a persona whose role does not, and names the roles that do', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/managers-only',
      headers: { cookie: cookieFor('consultant-paris') },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      type: '/problems/insufficient-role',
      deniedBy: '/problems/insufficient-role',
      detail: 'The action is carried by manager.',
    });
  });

  it('resolves the persona on a public route too, and does not refuse a broken cookie there', async () => {
    // A visitor with a stale cookie must still reach the selector that would fix it.
    app = serverWithGuardedRoutes();

    const signedIn = await app.inject({
      method: 'GET',
      url: '/api/v1/open',
      headers: { cookie: cookieFor('billing-paris') },
    });
    const broken = await app.inject({
      method: 'GET',
      url: '/api/v1/open',
      headers: { cookie: `${PERSONA_COOKIE}=nonsense` },
    });

    expect(signedIn.json()).toStrictEqual({ persona: 'billing-paris' });
    expect(broken.statusCode).toBe(200);
    expect(broken.json()).toStrictEqual({ persona: null });
  });
});

describe('the origin check', () => {
  it('lets a read through with no Origin at all', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/anyone-signed-in',
      headers: { cookie: cookieFor('consultant-paris') },
    });

    expect(response.statusCode).toBe(200);
  });

  it('refuses a write from another origin', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/managers-write',
      headers: { cookie: cookieFor('manager-paris'), origin: 'https://evil.example' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/forbidden-origin' });
  });

  it('refuses a write with no Origin, which is the part that costs something', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/managers-write',
      headers: { cookie: cookieFor('manager-paris') },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/forbidden-origin' });
  });

  it('runs before the persona is resolved, so an unauthenticated write is refused on origin first', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({ method: 'POST', url: '/api/v1/managers-write' });

    expect(response.json()).toMatchObject({ type: '/problems/forbidden-origin' });
  });

  it('lets a write through from the configured origin', async () => {
    app = serverWithGuardedRoutes();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/managers-write',
      headers: { cookie: cookieFor('manager-paris'), origin: ORIGIN },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('the session routes', () => {
  it('lists the four personas, and says out loud that they are not accounts', async () => {
    app = buildServer(dependencies);

    const response = await app.inject({ method: 'GET', url: '/api/v1/personas' });
    const body = response.json<{ notice: string; personas: { key: string; role: string }[] }>();

    expect(response.statusCode).toBe(200);
    expect(body.personas.map((persona) => persona.key)).toStrictEqual([
      'consultant-paris',
      'manager-paris',
      'manager-lyon',
      'billing-paris',
    ]);
    expect(body.notice).toBe(
      'Cette maquette n’a pas d’authentification : on choisit une identité, et tout le monde ' +
        'peut choisir n’importe laquelle.',
    );
  });

  it('sets a signed cookie when a persona is selected', async () => {
    app = buildServer(dependencies);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session/persona',
      headers: { origin: ORIGIN },
      payload: { key: 'manager-lyon' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain(
      `${PERSONA_COOKIE}=manager-lyon.${signPersonaKey('manager-lyon', SECRET)}`,
    );
    expect(response.json()).toStrictEqual({
      persona: {
        key: 'manager-lyon',
        role: 'manager',
        displayName: 'Emma Robert',
        office: 'Lyon',
      },
    });
  });

  it('answers 404 for a persona this instance does not offer', async () => {
    app = buildServer(dependencies);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session/persona',
      headers: { origin: ORIGIN },
      payload: { key: 'manager-marseille' },
    });

    expect(response.statusCode).toBe(404);
    // A key that does not exist is a 404 and not a 403: nothing is being refused, and the
    // catalogue that lists what is on offer is public.
    expect(response.json()).toMatchObject({ type: '/problems/not-found' });
  });

  it('answers 400 with the field for a body that is not a selection', async () => {
    app = buildServer(dependencies);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session/persona',
      headers: { origin: ORIGIN },
      payload: { persona: 'manager-lyon' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ type: '/problems/malformed-request' });
    expect(response.json<{ errors: Record<string, string[]> }>().errors).toHaveProperty('key');
  });

  it('clears the cookie on delete', async () => {
    app = buildServer(dependencies);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/session/persona',
      headers: { origin: ORIGIN, cookie: cookieFor('manager-lyon') },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toContain('Max-Age=0');
    expect(response.json()).toStrictEqual({ persona: null });
  });

  it('reports the current persona, and null when there is none', async () => {
    app = buildServer(dependencies);

    const none = await app.inject({ method: 'GET', url: '/api/v1/session' });
    const some = await app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers: { cookie: cookieFor('billing-paris') },
    });

    expect(none.json()).toStrictEqual({ persona: null });
    expect(some.json<{ persona: { key: string } }>().persona.key).toBe('billing-paris');
  });
});
