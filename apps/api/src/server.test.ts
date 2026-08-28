import { BusinessError } from '@erp/platform';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ApiConfig } from './config.ts';
import type { ServerDependencies } from './dependencies.ts';
import { ApiFailure } from './errors.ts';
import { PROBLEM_JSON } from './http/problem.ts';
import { CORRELATION_ID_HEADER, correlationIdOf } from './http/reply.ts';
import type { Transactionally } from './persistence/unit-of-work.ts';
import { PUBLIC } from './personas/access.ts';
import { inMemoryPersonas } from './personas/testing/catalogue.ts';
import { buildServer } from './server.ts';

/**
 * The fixture routes live under `/api/v1` on purpose: `web/representation.ts` makes HTML the
 * default representation and JSON the exception, so a refusal on `/boom` is a rendered page and a
 * refusal on `/api/v1/boom` is the problem document this file is about.
 */
const config: ApiConfig = {
  databaseUrl: 'postgres://erp_app:hunter2@localhost:5433/erp',
  host: '127.0.0.1',
  port: 0,
  publicOrigin: 'http://localhost:3000',
  sessionSigningKey: 'k'.repeat(40),
  logLevel: 'silent',
};

class CraIncomplete extends BusinessError {
  readonly problemType = '/problems/cra-incomplete';
}

class NotTheManager extends BusinessError {
  readonly problemType = '/problems/not-the-manager';
}

/** Neither a `BusinessError` nor a `TechnicalFailure`: what a third-party driver actually throws. */
class DriverBlewUp extends Error {}

/** No database in these tests: a route that reaches for one is a route in the wrong test file. */
const noDatabase: Transactionally = () => {
  throw new ApiFailure('this test builds no unit of work');
};

function dependencies(overrides: Partial<ServerDependencies> = {}): ServerDependencies {
  return {
    config,
    clock: { now: () => new Date('2026-06-15T09:00:00.000Z') },
    probeDatabase: () => Promise.resolve(),
    personas: inMemoryPersonas(),
    transactionally: noDatabase,
    newId: () => 'test-id',
    ...overrides,
  };
}

describe('correlationIdOf', () => {
  it('accepts a supplied id that has the shape of one', () => {
    expect(correlationIdOf('019ec893-f400-7000-8000-000000000000')).toBe(
      '019ec893-f400-7000-8000-000000000000',
    );
  });

  it('mints its own rather than echo something that is not an id', () => {
    // A header goes into every log line of the request. Anything accepted here can carry a
    // newline into a log file, and this instance is public.
    for (const hostile of ['not-an-id', 'a\nb', '', undefined, ['a', 'b'], 42]) {
      expect(correlationIdOf(hostile)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});

describe('the HTTP edge', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildServer(dependencies());
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers /healthz without touching the database', async () => {
    const probed = { called: false };
    const alone = buildServer(
      dependencies({
        probeDatabase: () => {
          probed.called = true;
          return Promise.resolve();
        },
      }),
    );

    const response = await alone.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ status: 'ok' });
    // The point of two routes rather than one: a database outage must not make an orchestrator
    // restart a process that is working.
    expect(probed.called).toBe(false);

    await alone.close();
  });

  it('answers /readyz once the database answers', async () => {
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ status: 'ready' });
  });

  it('answers /readyz with a 503 problem document when it does not', async () => {
    const down = buildServer(
      dependencies({ probeDatabase: () => Promise.reject(new Error('ECONNREFUSED')) }),
    );

    const response = await down.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain(PROBLEM_JSON);
    expect(response.json()).toMatchObject({ type: '/problems/database-unavailable' });
    // The probe's own message names an implementation detail; the answer does not carry it.
    expect(response.body).not.toContain('ECONNREFUSED');

    await down.close();
  });

  it('answers an unknown route with a problem document, not the framework own shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain(PROBLEM_JSON);
    expect(response.json()).toMatchObject({
      type: '/problems/not-found',
      instance: '/api/v1/nope',
    });
  });

  it('turns a business refusal into its mapped status', async () => {
    app.get('/api/v1/boom', { config: { access: PUBLIC('a fixture route') } }, () => {
      throw new CraIncomplete('3 workable days are unaccounted for', { missing: 3 });
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/boom' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      type: '/problems/cra-incomplete',
      invariant: '/problems/cra-incomplete',
      errors: { missing: ['3'] },
    });
  });

  it('names the rule that denied a 403 and publishes no business field', async () => {
    app.get('/api/v1/denied', { config: { access: PUBLIC('a fixture route') } }, () => {
      throw new NotTheManager("March is validated by March's manager", { managerId: 'mgr-7' });
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/denied' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ deniedBy: '/problems/not-the-manager' });
    expect(response.body).not.toContain('mgr-7');
  });

  it('publishes nothing but the correlation id when something unexpected fails', async () => {
    app.get('/api/v1/crash', { config: { access: PUBLIC('a fixture route') } }, () => {
      throw new DriverBlewUp('connection string postgres://erp_app:hunter2@localhost/erp');
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ type: '/problems/internal' });
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('DriverBlewUp');
  });

  it('answers a body that is not JSON with a malformed-request problem', async () => {
    app.post('/api/v1/echo', { config: { access: PUBLIC('a fixture route') } }, () => ({
      ok: true,
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/echo',
      // The origin check runs on `onRequest`, before the body is parsed, so a POST without it
      // never reaches the parser. That ordering is deliberate — a cross-site request is refused
      // before anything reads its payload.
      headers: { 'content-type': 'application/json', origin: config.publicOrigin },
      body: '{not json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ type: '/problems/malformed-request' });
  });

  it('echoes the correlation id on every answer, including a refusal', async () => {
    const supplied = '019ec893-f400-7000-8000-0000000000ff';

    for (const url of ['/healthz', '/api/v1/nope']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { [CORRELATION_ID_HEADER]: supplied },
      });

      expect(response.headers[CORRELATION_ID_HEADER]).toBe(supplied);
    }
  });

  it('mints a correlation id when the caller supplies none', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.headers[CORRELATION_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
