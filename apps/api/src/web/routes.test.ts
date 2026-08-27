import { ROLES } from '@erp/platform';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DECIDES_CRA } from '../composition/pre-facturier.ts';
import type { ApiConfig } from '../config.ts';
import { ApiFailure } from '../errors.ts';
import type { Transactionally } from '../persistence/unit-of-work.ts';
import { carries, forRoles } from '../personas/access.ts';
import { PERSONA_COOKIE, signPersonaKey } from '../personas/cookie.ts';
import { inMemoryPersonas } from '../personas/testing/catalogue.ts';
import { buildServer } from '../server.ts';

import { STYLESHEET } from './assets.ts';
import { LABELS } from './labels.ts';
import { PATHS } from './paths.ts';
import { CONTENT_SECURITY_POLICY } from './reply.ts';
import { ISSUES_INVOICE } from './routes.ts';

/**
 * The screens through `fastify.inject`, with no database: the persona catalogue is the in-memory
 * one, which is enough for everything this task decides — the selector, the cookie round trip, and
 * the fact that a refusal on a screen path is a **page** carrying the same `ProblemDetails` the API
 * would have returned.
 */

const ORIGIN = 'http://localhost:3000';
const SECRET = 'k'.repeat(40);

const config: ApiConfig = {
  databaseUrl: 'unused: no route in this file touches the database',
  host: '127.0.0.1',
  port: 0,
  publicOrigin: ORIGIN,
  sessionSigningKey: SECRET,
  logLevel: 'silent',
};

const noDatabase: Transactionally = () => {
  throw new ApiFailure('this test builds no unit of work');
};

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

let app: FastifyInstance;

/**
 * Deliberately non-existent, so this suite's SPA-fallback assertions do not depend on whether
 * `pnpm --filter @erp/web build` happens to have already run on the machine running it — the same
 * test must answer the same way either way. `spa.test.ts` covers the real-`dist` case against a
 * throwaway fixture directory of its own.
 */
const NO_DIST_HERE = '/nonexistent-dist-fixture-for-routes-test/';

beforeEach(() => {
  app = buildServer(
    {
      config,
      clock: { now: () => new Date('2026-06-15T09:00:00.000Z') },
      probeDatabase: () => Promise.resolve(),
      personas: inMemoryPersonas(),
      transactionally: noDatabase,
      newId: () => 'unused',
    },
    NO_DIST_HERE,
  );
});

afterEach(async () => {
  await app.close();
});

/**
 * The persona **cookie**, not the selector: the selector itself is `apps/web`'s screen since
 * front-end plan Phase 9.3, and `GET /` is answered by the SPA fallback (`server.ts`). What is
 * still this file's to prove is the round trip the SPA cannot own — the two POST verbs that mint
 * and clear the signed cookie, and the fact that a key this instance does not offer is refused as
 * a page.
 *
 * Three tests are gone with the screen (the selector renders before an identity exists; it says
 * it is not authentication; it offers every seeded persona). The first two are `apps/web`'s now;
 * the catalogue behind the third is `GET /api/v1/personas` (`routes/session.ts`), covered by its
 * own tests. A fourth — "shows the chosen persona in the header of the next page" — is dropped as
 * redundant rather than moved: "still shows who the refused visitor is" below asserts the same
 * cookie-to-chrome round trip on a page this file still renders, and the version that GET-ed
 * `PATHS.home` for it kept passing after the route was unregistered, off the 404 page's own shell.
 */
describe('the persona cookie', () => {
  it('sets a signed cookie and redirects, so a refresh does not repost the choice', async () => {
    const response = await app.inject({
      method: 'POST',
      url: PATHS.choosePersona,
      headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'key=manager-lyon',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(PATHS.home);
    expect(response.headers['set-cookie']).toContain(`${PERSONA_COOKIE}=manager-lyon.`);
    expect(response.headers['set-cookie']).toContain('HttpOnly');
    expect(response.headers['set-cookie']).toContain('SameSite=Strict');
  });

  it('clears the persona through a POST, because a form cannot DELETE', async () => {
    const response = await app.inject({
      method: 'POST',
      url: PATHS.clearPersona,
      headers: { origin: ORIGIN, ...as('manager-lyon') },
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers['set-cookie']).toContain('Max-Age=0');
  });

  it('refuses a persona this instance does not offer, as a page and not as JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: PATHS.choosePersona,
      headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'key=admin-root',
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(LABELS.problem.heading.notFound);
  });
});

describe('the origin check, met by a browser for the first time', () => {
  it('refuses a form post that carries no Origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: PATHS.choosePersona,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'key=manager-lyon',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('/problems/forbidden-origin');
  });

  it('refuses a form post from another origin, and says so on a page', async () => {
    const response = await app.inject({
      method: 'POST',
      url: PATHS.choosePersona,
      headers: {
        origin: 'https://evil.test',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'key=manager-lyon',
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(LABELS.problem.heading.denied);
  });
});

describe('a refusal on a screen path is the API refusal, rendered', () => {
  it('renders a role refusal as a page naming the rule that denied it', async () => {
    app.get('/interdit', { config: { access: forRoles('manager') } }, () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/interdit',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['content-type']).toContain('text/html');
    // The same `deniedBy` the JSON carries, on the page, so the demonstration is reproducible
    // from either side.
    expect(response.body).toContain('/problems/insufficient-role');
    expect(response.body).toContain(LABELS.problem.deniedBy);
  });

  it('still shows who the refused visitor is, which is half the demonstration', async () => {
    app.get('/interdit', { config: { access: forRoles('manager') } }, () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/interdit',
      headers: as('consultant-paris'),
    });

    expect(response.body).toContain('Alice Martin');
  });

  it('renders an unknown screen path as a page and an unknown API path as JSON', async () => {
    const page = await app.inject({ method: 'GET', url: '/pas-de-page' });
    const json = await app.inject({ method: 'GET', url: '/api/v1/nothing' });

    expect(page.headers['content-type']).toContain('text/html');
    expect(json.headers['content-type']).toContain('application/problem+json');
    expect(json.json()).toMatchObject({ type: '/problems/not-found' });
  });

  it('publishes no business detail on a technical failure, on a page either', async () => {
    app.get('/casse', { config: { access: forRoles('consultant') } }, () => {
      throw new ApiFailure('connection string: postgres://user:hunter2@host/db');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/casse',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('hunter2');
    expect(response.body).toContain(LABELS.problem.heading.internal);
  });
});

describe('the stylesheet', () => {
  it('is served from the path that carries its content hash', async () => {
    const response = await app.inject({ method: 'GET', url: STYLESHEET.path });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/css');
    expect(response.headers['cache-control']).toContain('immutable');
  });

  it('answers 304 to a browser that already holds it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: STYLESHEET.path,
      headers: { 'if-none-match': STYLESHEET.etag },
    });

    expect(response.statusCode).toBe(304);
  });

  it('has no path parameter of its own to traverse — one literal route, computed at boot', async () => {
    for (const attempt of ['/assets/style.css', '/assets/']) {
      const response = await app.inject({ method: 'GET', url: attempt });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
  });
});

describe('the SPA build assets (Phase 9.1)', () => {
  it("serves a real built file under /assets/*, distinct from the stylesheet's own route", async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/index-fixture.js' });

    // No `apps/web/dist` in this suite (no route in this file builds the web app), so this is
    // the same "not built" 404 every non-e2e test gets — proven distinct from the stylesheet's
    // one hand-computed literal by going through `registerSpa`'s wildcard route at all rather
    // than 404ing before a route ever matched.
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  // Traversal safety under `/assets/*` is proven in `spa.test.ts`, driving `reply.sendFile`
  // directly against a real fixture: `app.inject()` (`light-my-request`) normalizes a literal
  // `..` out of the URL before Fastify's router ever sees it, so a traversal attempt sent through
  // this file's `app.inject` never reaches the code path it would claim to test. Verified live
  // too (task 9.1's own commit): `curl --path-as-is` against a real built `dist` answers 403
  // before any handler runs.

  it('still renders the ordinary 404 page for an unmatched screen path when dist is not built', async () => {
    // `serveSpaShellOrNull` returns `null` here (no `apps/web/dist` in this suite), so this
    // proves the fallback wiring in `server.ts` does not swallow the pre-existing behaviour when
    // the shell isn't available — `spa.test.ts` proves the actual `index.html` serving, against
    // a real fixture directory, and task 9.1's own commit records a live `curl` against a real
    // build showing `/cra` answering the SPA shell (200, `text/html`, the built `index.html`).
    const response = await app.inject({ method: 'GET', url: '/cra/2026-06' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('leaves an unmatched API path as JSON, never the SPA shell', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });

    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('leaves an unmatched non-GET path as the ordinary refusal page, not the SPA shell', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/nope',
      headers: { origin: ORIGIN },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
  });
});

describe('security headers', () => {
  it("sends exactly the string frozen in ADR-0064, admitting only the SPA's own bundle", async () => {
    // The stylesheet and not `PATHS.home`: since Phase 9.3 no route in this file answers `/`, and
    // the version of this test that asked for it was asserting the header on a 404 page — true,
    // but not the observation it claims to make. `STYLESHEET.path` is the one route left here
    // that renders a 200 with no database.
    const response = await app.inject({ method: 'GET', url: STYLESHEET.path });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; " +
        "font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; " +
        "frame-ancestors 'none'",
    );
  });

  it('carries them on the API too, so the list has no exception to remember', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/personas' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('same-origin');
  });

  /**
   * The regression guard for 23/08/2026, when `no-referrer` made every screen unusable.
   *
   * Nothing in this suite can catch that bug by reproducing it: `app.inject()` sets `Origin`
   * itself, so no test here has ever seen a browser-derived one, and the header the browser
   * derives it *from* is the only observable this suite has. Fetch nulls a non-`GET` navigation's
   * `Origin` under `no-referrer` — same-origin included — so this value and the origin check of
   * `personas/access.ts` are one mechanism written in two files, and a future tightening back to
   * `no-referrer` for privacy has to fail here rather than in a reader's browser.
   */
  it('does not send a referrer policy that nulls the Origin of its own form posts', async () => {
    const response = await app.inject({ method: 'GET', url: PATHS.choosePersona });

    expect(response.headers['referrer-policy']).not.toBe('no-referrer');
  });
});

describe('the form body parser', () => {
  it('collects repeated field names into an array, which the Cra grid will post', async () => {
    let seen: unknown;
    app.post('/formulaire', { config: { access: forRoles('consultant') } }, (request) => {
      seen = request.body;

      return { ok: true };
    });

    await app.inject({
      method: 'POST',
      url: '/formulaire',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
        ...as('consultant-paris'),
      },
      payload: 'jour=2026-06-01&jour=2026-06-02&mois=2026-06',
    });

    expect(seen).toEqual({ jour: ['2026-06-01', '2026-06-02'], mois: '2026-06' });
  });

  it('cannot reach Object.prototype through a field name', async () => {
    let seen: Record<string, unknown> = {};
    app.post('/formulaire', { config: { access: forRoles('consultant') } }, (request) => {
      seen = request.body as Record<string, unknown>;

      return { ok: true };
    });

    await app.inject({
      method: 'POST',
      url: '/formulaire',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
        ...as('consultant-paris'),
      },
      payload: '__proto__=polluted',
    });

    expect(Object.getPrototypeOf(seen)).toBeNull();
    expect({}).not.toHaveProperty('polluted');
  });

  it('refuses a parameter flood, and the handler never runs', async () => {
    let reached = false;
    app.post('/formulaire', { config: { access: forRoles('consultant') } }, () => {
      reached = true;

      return { ok: true };
    });

    // The body limit caps the bytes; this caps the *shape*. 501 one-character fields are a few
    // kilobytes, so only the field count can be what refuses them.
    const flood = Array.from({ length: 501 }, (_, index) => `f${String(index)}=1`).join('&');
    const response = await app.inject({
      method: 'POST',
      url: '/formulaire',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
        ...as('consultant-paris'),
      },
      payload: flood,
    });

    expect(response.statusCode).toBe(400);
    expect(reached).toBe(false);
  });

  it('accepts a body that sits exactly on the cap', async () => {
    let count = 0;
    app.post('/formulaire', { config: { access: forRoles('consultant') } }, (request) => {
      count = Object.keys(request.body as Record<string, unknown>).length;

      return { ok: true };
    });

    const atCap = Array.from({ length: 500 }, (_, index) => `f${String(index)}=1`).join('&');
    const response = await app.inject({
      method: 'POST',
      url: '/formulaire',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
        ...as('consultant-paris'),
      },
      payload: atCap,
    });

    expect(response.statusCode).toBe(200);
    expect(count).toBe(500);
  });
});

/**
 * The offer and the refusal come off one declaration (ADR-0023). A screen decides whether to draw
 * the button by asking the verb's own `Access` through `carries`; these tests drive the same roles
 * at the verb itself and assert the two answers agree for **every** role — so moving a verb between
 * roles cannot leave a button behind, which a hand-written table of roles would have allowed.
 */
describe('a verb and the button that offers it', () => {
  const personaByRole = {
    consultant: 'consultant-paris',
    manager: 'manager-paris',
    billing: 'billing-paris',
  } as const;

  async function refusedOnRole(url: string, role: (typeof ROLES)[number]): Promise<boolean> {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: {
        origin: ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
        ...as(personaByRole[role]),
      },
      payload: '',
    });

    // A role that carries the verb gets past the check and fails later on the absent database;
    // only this problem type means the role itself was refused. These are screen paths, so the
    // refusal arrives as a rendered page that prints its `type` (ADR-0026), never as JSON.
    return response.statusCode === 403 && response.body.includes('/problems/insufficient-role');
  }

  for (const role of ROLES) {
    it(`offers the Cra decision to ${role} exactly when the route carries it`, async () => {
      expect(await refusedOnRole(`${PATHS.validateCra}/some-id`, role)).toBe(
        !carries(DECIDES_CRA, role),
      );
      expect(await refusedOnRole(`${PATHS.refuseCra}/some-id`, role)).toBe(
        !carries(DECIDES_CRA, role),
      );
    });

    it(`refuses issuance for ${role} exactly when the route does not carry it`, async () => {
      expect(await refusedOnRole(`${PATHS.issueInvoice}/some-id`, role)).toBe(
        !carries(ISSUES_INVOICE, role),
      );
    });
  }
});
