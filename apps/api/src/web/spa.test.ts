import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerSpa, serveSpaShellOrNull } from './spa.ts';

/**
 * `registerSpa` and `serveSpaShellOrNull` against a real, throwaway `dist`-shaped directory —
 * neither is exercised through `apps/api/src/web/routes.test.ts`'s `buildServer` fixture, which
 * has no `apps/web/dist` to point at (no test in this suite builds the web app). A real
 * `mkdtemp` fixture is what lets this file prove the actual file-serving and traversal-refusal
 * behaviour rather than only the "not built" fallback path.
 */

let distDir: string;
let app: FastifyInstance;

beforeEach(async () => {
  distDir = `${await mkdtemp(join(tmpdir(), 'erp-spa-'))}/`;
  await mkdir(join(distDir, 'assets'));
  await writeFile(join(distDir, 'assets', 'index-fixture.js'), 'console.log("fixture");');
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>fixture</title>');

  app = Fastify();
  registerSpa(app, distDir);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(distDir, { recursive: true, force: true });
});

describe('registerSpa — the built assets, /assets/*', () => {
  it("serves a real file under the wildcard route, unrelated to the stylesheet's own literal", async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/index-fixture.js' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('console.log("fixture");');
  });

  it("calls callNotFound (Fastify's own 404) for a file that does not exist", async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/does-not-exist.js' });

    expect(response.statusCode).toBe(404);
  });

  it('never reads outside dist, even when the captured segment is a literal ".."', async () => {
    // `app.inject()` (`light-my-request`) normalizes a `..` segment out of the URL before Fastify
    // ever sees it — verified live in task 9.1's own commit (`curl --path-as-is` against a real
    // `dist`: Fastify's router refuses the raw segment, 403, before any handler runs). Neither
    // path proves what `@fastify/send` itself does with a `..` that reaches its call — so this
    // test drives `reply.sendFile` directly with one, bypassing routing/normalization entirely,
    // against a secret planted one level above `distDir` that a traversal would read if anything
    // here failed to stop it.
    const secretDir = distDir.replace(/\/$/u, '').split('/').slice(0, -1).join('/');
    await writeFile(join(secretDir, 'erp-spa-secret.txt'), 'must never be served');

    const direct = Fastify();
    registerSpa(direct, distDir);
    direct.get('/direct-sendfile', (_request, reply) =>
      reply.sendFile('../erp-spa-secret.txt', distDir),
    );
    await direct.ready();

    const response = await direct.inject({ method: 'GET', url: '/direct-sendfile' });

    expect(response.statusCode).not.toBe(200);
    expect(response.body).not.toContain('must never be served');

    await direct.close();
    await rm(join(secretDir, 'erp-spa-secret.txt'), { force: true });
  });

  it('declares an Access config on its route, the same shape registerAccessControl requires', async () => {
    // `onRoute` fires as each route is registered, so the hook must be added before `registerSpa`
    // runs — this is a fresh instance for exactly that reason (`beforeEach`'s `app` already
    // registered its route by the time a test body runs).
    const fresh = Fastify();
    let declaredAccess: unknown;
    fresh.addHook('onRoute', (route) => {
      if (route.url === '/assets/*') declaredAccess = route.config?.access;
    });
    registerSpa(fresh, distDir);
    await fresh.ready();
    await fresh.close();

    expect(declaredAccess).toMatchObject({ kind: 'public' });
  });
});

describe('serveSpaShellOrNull', () => {
  it('sends dist/index.html when it exists', async () => {
    // Its own instance, routed before `ready()`: `beforeEach`'s `app` has already booted by the
    // time a test body runs, and Fastify refuses a route registered after that.
    const withShell = Fastify();
    registerSpa(withShell, distDir);
    withShell.get('/whatever', (_request, reply) => {
      const shell = serveSpaShellOrNull(reply, distDir);

      return shell ?? reply.code(404).send();
    });
    await withShell.ready();

    const response = await withShell.inject({ method: 'GET', url: '/whatever' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>fixture</title>');
    await withShell.close();
  });

  it('returns null, sending nothing, when dist/index.html does not exist', async () => {
    const empty = `${await mkdtemp(join(tmpdir(), 'erp-spa-empty-'))}/`;
    const bare = Fastify();
    bare.get('/whatever', (_request, reply) => {
      const shell = serveSpaShellOrNull(reply, empty);
      expect(shell).toBeNull();

      return reply.code(599).send('sentinel: caller must handle null itself');
    });
    await bare.ready();

    const response = await bare.inject({ method: 'GET', url: '/whatever' });

    expect(response.statusCode).toBe(599);
    await bare.close();
    await rm(empty, { recursive: true, force: true });
  });
});
