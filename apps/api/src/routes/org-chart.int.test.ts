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

/**
 * `GET /api/v1/org-chart` (item 18, QA round 3 — the dashboard's org-chart panel), which is a **new read
 * path over people**, so it is held to CLAUDE.md's proof point 3: authorization by role *and* by
 * scope, with a test.
 *
 * Two independent filters decide a manager's reports, and the fixture below is built so that
 * removing either one fails a test — a fixture where every report is same-office *and*
 * hierarchy-attached would pass with either filter deleted, and prove neither:
 *
 * - **Office.** `Gaby` works in Lyon and `manager_attachments` names *Bruno* (Paris) as her
 *   manager. That row is not invented out of nowhere: `scripts/lib/seed-data.ts` carried two of
 *   exactly this shape (Gabrielle/Bordeaux → Bruno/Paris, François/Rennes → Emma/Lyon) before QA
 *   round 4 reattached both to their own office's manager — the cross-office case this test still
 *   has to refuse. Bruno must not read her name — every other read in this app is bounded by
 *   `actor.officeId`, and an org-chart panel that reached past it would be the one screen that
 *   leaks a name the rest of the API refuses to show. `docs/open-questions.md` carries the
 *   consequence for the *write* side, which this endpoint does not decide.
 * - **Hierarchy.** `Diane` works in Lyon and reports to Emma. She is in Emma's office *and* in
 *   Emma's chain; `Gaby` is in Emma's office and not in her chain. Emma reads exactly one of them.
 *
 * And the departure half of ADR-0079, which is two assertions, not one: `Marine` is absent from
 * Bruno's roster **and** her historical Cra is still readable by him. A "filter departed people
 * out everywhere" change passes the first and fails the second.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'e'.repeat(40);

const PARIS = 'orgchart-office-paris';
const LYON = 'orgchart-office-lyon';

const ALICE = 'orgchart-alice';
const BRUNO = 'orgchart-bruno';
const EMMA = 'orgchart-emma';
const HENRI = 'orgchart-henri';
/** Lyon, attached to Bruno (Paris) — the cross-office row the office filter has to refuse. */
const GABY = 'orgchart-gaby';
/** Lyon, attached to Emma — the one report Emma is allowed. */
const DIANE = 'orgchart-diane';
/**
 * Paris, left the firm on 2022-12-31 (ADR-0079). Her attachment to Bruno is left **open**, unlike
 * the seed's own, which closes on her departure date: with it closed, `managerOn` alone would keep
 * her out of his roster and the departure filter could be deleted without failing a thing. Open,
 * `departure_date` is the only reason she is absent — which is the claim being tested.
 */
const MARINE = 'orgchart-marine';

const MARINE_CRA = 'orgchart-cra-marine';

/** Well after Marine's departure, so "today" is unambiguous for `managerOn`. */
const NOW = new Date('2026-07-02T09:00:00.000Z');

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
  {
    key: 'manager-lyon',
    role: 'manager',
    consultantId: EMMA,
    officeId: LYON,
    officeName: 'Lyon',
    displayName: 'Emma Robert',
  },
  {
    key: 'billing-paris',
    role: 'billing',
    consultantId: HENRI,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Henri Laurent',
  },
  // Not one of the four personas the application ships (ADR-0023 pins that list at four) — this
  // one exists so the cross-office consultant can be the one *asking*, which is the only way to
  // reach the N+1 half of ADR-0090 from the side the office boundary does not govern.
  {
    key: 'consultant-lyon',
    role: 'consultant',
    consultantId: GABY,
    officeId: LYON,
    officeName: 'Lyon',
    displayName: 'Gaby Petit',
  },
];

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

let app: FastifyInstance;

beforeEach(async () => {
  const { client } = transaction;

  app = buildServer({
    config,
    clock: { now: () => NOW },
    probeDatabase: () => Promise.resolve(),
    personas: inMemoryPersonas(personas),
    transactionally: savepointTransactionally(client, uuidv7),
    newId: uuidv7,
  });

  await client.query(
    `INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris'), ($2, 'Lyon', 'Lyon')`,
    [PARIS, LYON],
  );
  await client.query(
    `INSERT INTO public.practices (id, name) VALUES ('orgchart-practice', 'Audit')`,
  );
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id,
       role, departure_date)
     VALUES ($1, 'Alice', 'Martin', 'orgchart-a@t', $7, 'orgchart-practice', 'consultant', NULL),
            ($2, 'Bruno', 'Leroy', 'orgchart-b@t', $7, 'orgchart-practice', 'manager', NULL),
            ($3, 'Emma', 'Robert', 'orgchart-e@t', $8, 'orgchart-practice', 'manager', NULL),
            ($4, 'Henri', 'Laurent', 'orgchart-h@t', $7, 'orgchart-practice', 'director', NULL),
            ($5, 'Gaby', 'Petit', 'orgchart-g@t', $8, 'orgchart-practice', 'consultant', NULL),
            ($6, 'Diane', 'Nguyen', 'orgchart-d@t', $8, 'orgchart-practice', 'consultant', NULL),
            ($9, 'Marine', 'Girard', 'orgchart-m@t', $7, 'orgchart-practice', 'consultant',
             '2022-12-31')`,
    [ALICE, BRUNO, EMMA, HENRI, GABY, DIANE, PARIS, LYON, MARINE],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $7, $8, '2024-01-01', NULL),
            ($2, $9, $8, '2024-06-01', NULL),
            ($3, $10, $11, '2024-01-01', NULL),
            ($4, $8, $12, '2023-01-01', NULL),
            ($5, $11, $12, '2023-06-01', NULL),
            ($6, $13, $8, '2016-01-01', NULL)`,
    [
      uuidv7(),
      uuidv7(),
      uuidv7(),
      uuidv7(),
      uuidv7(),
      uuidv7(),
      ALICE,
      BRUNO,
      GABY,
      DIANE,
      EMMA,
      HENRI,
      MARINE,
    ],
  );

  // Marine's last month before she left — the half of ADR-0079 that has to stay readable.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, validated_at)
     VALUES ($1, $2, $3, '2022-12', 'validated', '2023-01-05T09:00:00Z')`,
    [MARINE_CRA, MARINE, PARIS],
  );
});

afterEach(async () => {
  await app.close();
});

async function orgChart(persona: string): Promise<Awaited<ReturnType<typeof app.inject>>> {
  return app.inject({ method: 'GET', url: '/api/v1/org-chart', headers: as(persona) });
}

describe('GET /api/v1/org-chart — by role', () => {
  it('a consultant reads their own manager, and no roster at all', async () => {
    const response = await orgChart('consultant-paris');

    expect(response.statusCode).toBe(200);
    // `toStrictEqual`, not `toMatchObject`: the point is that no `reports` key reaches a
    // consultant, which a subset match would not notice.
    expect(response.json()).toStrictEqual({
      role: 'consultant',
      manager: { id: BRUNO, displayName: 'Bruno Leroy' },
    });
  });

  it('billing is refused — the director is the top of this chart, not a subject of it', async () => {
    const response = await orgChart('billing-paris');

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it('no persona at all is refused before any role is considered', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/org-chart' });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/v1/org-chart — by scope', () => {
  it('a manager reads their own office only: Gaby reports to Bruno on paper and Bruno cannot see her', async () => {
    const response = await orgChart('manager-paris');

    expect(response.statusCode).toBe(200);
    const body = response.json<{ reports: { id: string; displayName: string }[] }>();

    expect(body).toMatchObject({
      role: 'manager',
      manager: { id: HENRI, displayName: 'Henri Laurent' },
    });
    expect(body.reports).toStrictEqual([{ id: ALICE, displayName: 'Alice Martin' }]);
    // Said again as an explicit absence: `toStrictEqual` above would also pass if the endpoint
    // returned Gaby *instead* of Alice, and this is the assertion that names why she is missing.
    expect(response.body).not.toContain(GABY);
    expect(response.body).not.toContain('Gaby');
  });

  it('the other office reads its own roster, and the two do not overlap', async () => {
    const response = await orgChart('manager-lyon');

    expect(response.statusCode).toBe(200);
    const body = response.json<{ reports: { id: string }[] }>();

    // Gaby is in Emma's office and *not* in her chain; Diane is in both. Emma reads Diane only —
    // which is the hierarchy filter doing work the office filter cannot do.
    expect(body.reports).toStrictEqual([{ id: DIANE, displayName: 'Diane Nguyen' }]);
    expect(response.body).not.toContain(ALICE);
  });
});

describe('GET /api/v1/org-chart — the N+1 half crosses the office on purpose (ADR-0090)', () => {
  it('tells a consultant who their manager is even when he works in another office', async () => {
    const response = await orgChart('consultant-lyon');

    expect(response.statusCode).toBe(200);
    // Gaby is in Lyon and Bruno manages Paris. He is still the person who accepts her Cra, so
    // withholding his name would be a lie of omission on the one fact this panel states.
    expect(response.json()).toStrictEqual({
      role: 'consultant',
      manager: { id: BRUNO, displayName: 'Bruno Leroy' },
    });
  });

  it('and the same pair, read the other way, still stops at the office', async () => {
    // The asymmetry stated as a pair rather than as two unrelated tests: one name upward, no list
    // downward, for the very same two people.
    const response = await orgChart('manager-paris');
    const { reports } = response.json<{ reports: { id: string }[] }>();

    expect(reports.map((report) => report.id)).not.toContain(GABY);
  });
});

describe('GET /api/v1/org-chart — a consultant who has left (ADR-0079)', () => {
  it('is absent from her manager’s current roster', async () => {
    const response = await orgChart('manager-paris');
    const { reports } = response.json<{ reports: { id: string }[] }>();

    expect(reports.map((report) => report.id)).not.toContain(MARINE);
  });

  it('and her old Cra is still readable by that same manager', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cras?consultantIds=${MARINE}`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const { cras } = response.json<{ cras: { id: string; period: string; status: string }[] }>();
    expect(cras).toStrictEqual([
      expect.objectContaining({ id: MARINE_CRA, period: '2022-12', status: 'validated' }),
    ]);
  });
});
