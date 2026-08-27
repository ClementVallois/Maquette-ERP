import { useTestTransaction } from '@erp/test-harness';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ApiConfig } from '../config.ts';
import { uuidv7 } from '../ids/uuidv7.ts';
import type { Persona } from '../personas/catalogue.ts';
import { PERSONA_COOKIE, signPersonaKey } from '../personas/cookie.ts';
import { inMemoryPersonas } from '../personas/testing/catalogue.ts';
import { buildServer } from '../server.ts';
import { savepointTransactionally } from '../testing/transaction.ts';

import { LABELS } from './labels.ts';
import { PATHS } from './paths.ts';

/**
 * The three states `CLAUDE.md` calls deliverables rather than polish: empty, error, and permission
 * denied (BUILD-PLAN 6.6).
 *
 * They are asserted here as **pages**, because that is where they are a deliverable. The same
 * refusals already have API tests; what these add is that a visitor is told, in French, which of
 * ADR-0023's three loci said no — and that an absence and a refusal look different, which is the
 * distinction ADR-0003's two beats exist to draw.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 's'.repeat(40);
const PARIS = 'st-office-paris';
const ALICE = 'st-alice';
const BRUNO = 'st-bruno';

const config: ApiConfig = {
  databaseUrl: 'unused: every read goes through the injected unit of work',
  host: '127.0.0.1',
  port: 0,
  publicOrigin: ORIGIN,
  sessionSigningKey: SECRET,
  logLevel: 'silent',
};

const personas: readonly Persona[] = [
  {
    key: 'consultant-paris',
    role: 'consultant',
    consultantId: ALICE,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Alice Martin',
  },
  {
    key: 'manager-paris',
    role: 'manager',
    consultantId: BRUNO,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Bruno Leroy',
  },
];

/** Widened for lookup, as `problem-page.ts` does — the table itself stays `as const`. */
const SENTENCES: Readonly<Record<string, string | undefined>> = LABELS.problem.sentences;

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

let app: FastifyInstance;

/**
 * Deliberately non-existent (same reasoning as `routes.test.ts`): the "unknown page answers a
 * page, not JSON" test below must answer the same way whether or not `pnpm --filter @erp/web
 * build` has already run on the machine running this suite. `spa.test.ts` covers the real-`dist`
 * SPA-fallback case against a throwaway fixture directory of its own.
 */
const NO_DIST_HERE = '/nonexistent-dist-fixture-for-states-int-test/';

beforeEach(async () => {
  const { client } = transaction;

  app = buildServer(
    {
      config,
      clock: { now: () => new Date('2026-07-02T09:00:00.000Z') },
      probeDatabase: () => Promise.resolve(),
      personas: inMemoryPersonas(personas),
      transactionally: savepointTransactionally(client, uuidv7),
      newId: uuidv7,
    },
    NO_DIST_HERE,
  );

  await client.query(`INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris')`, [
    PARIS,
  ]);
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('st-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'st-a@t', $3, 'st-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'st-b@t', $3, 'st-practice', 'manager')`,
    [ALICE, BRUNO, PARIS],
  );
});

afterEach(async () => {
  await app.close();
});

describe('an empty state', () => {
  it('says the list is genuinely empty, and that it is not a refusal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}?periode=2026-01`,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(LABELS.cra.emptyList);
    expect(response.body).toContain(LABELS.cra.emptyListHint);
  });

  it('is reachable by URL, so a view can be shared as it was seen', async () => {
    // BUILD-PLAN 6.6: filters live in the URL. The proof is that the filter round-trips — the
    // month asked for comes back selected rather than being silently replaced by a default.
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-01`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('value="2026-01" selected="selected"');
  });
});

describe('a refusal, rendered', () => {
  it('says in French which rule refused, and never in English', async () => {
    const response = await app.inject({
      method: 'GET',
      url: PATHS.preFacturier,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain(LABELS.problem.heading.denied);
    expect(response.body).toContain(SENTENCES['/problems/insufficient-role'] ?? 'missing');
    // ADR-0060: `ProblemDetails.title` is the API's field and stays off the page.
    expect(response.body).not.toContain('This role does not carry this action');
  });

  it('scopes its table headers and carries no title, like every other page (ADR-0061)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: PATHS.preFacturier,
      headers: as('consultant-paris'),
    });

    expect([...response.body.matchAll(/<th(?=[\s>])(?![^>]*scope=)[^>]*>/gu)]).toStrictEqual([]);
    expect(response.body).not.toMatch(/<[a-z][^>]*\stitle="/u);
  });

  it('keeps the machine-readable type alongside the sentence', async () => {
    const response = await app.inject({
      method: 'GET',
      url: PATHS.preFacturier,
      headers: as('consultant-paris'),
    });

    expect(response.body).toContain('/problems/insufficient-role');
    expect(response.body).toContain(LABELS.problem.deniedBy);
    expect(response.body).toContain(LABELS.problem.correlationId);
  });

  it('answers an unknown page with a page, not with JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/rien-du-tout' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(LABELS.problem.heading.notFound);
    expect(response.body).toContain(SENTENCES['/problems/not-found'] ?? 'missing');
  });

  it('answers an unknown API route with problem+json, on the same failure', async () => {
    // The path decides the representation and nothing else does (`web/representation.ts`). The
    // same 404 answers differently because of where it was asked, never because of who asked.
    const response = await app.inject({ method: 'GET', url: '/api/v1/rien-du-tout' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('tells a visitor with no persona to choose one, rather than showing a blank screen', async () => {
    const response = await app.inject({ method: 'GET', url: PATHS.consultantCra });

    expect(response.statusCode).toBe(401);
    expect(response.body).toContain(SENTENCES['/problems/no-persona'] ?? 'missing');
    expect(response.body).toContain(LABELS.problem.back);
  });

  it('refuses a state-changing request with no Origin, and says so in French', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: { ...as('consultant-paris'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'action=save',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain(SENTENCES['/problems/forbidden-origin'] ?? 'missing');
  });
});
