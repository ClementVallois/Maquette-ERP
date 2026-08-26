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
 * `GET /api/v1/consultants/:consultantId/cras/:period/grid` (ADR-0071): a manager reads a **named**
 * consultant's month, read-only. Same composition as `cra-grid.int.test.ts`'s route, generalised —
 * this file's job is the part that route never had to prove: the scope check, on both sides of it,
 * **and on a month that has no Cra row at all**, which is the exact gap ADR-0071's Context section
 * names (`assertMayRead` used to run only after a matching row was found).
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'g'.repeat(40);

const PARIS = 'mgrid-office-paris';
const LYON = 'mgrid-office-lyon';
const ALICE = 'mgrid-alice';
const BRUNO = 'mgrid-bruno';
const EMMA = 'mgrid-emma';
const MISSION = 'mgrid-mission';
const CLIENT = 'mgrid-client';
const CRA_JUNE = 'mgrid-cra-june';

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
];

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

let app: FastifyInstance;

beforeEach(async () => {
  const { client } = transaction;

  app = buildServer({
    config,
    clock: { now: () => new Date('2026-07-02T09:00:00.000Z') },
    probeDatabase: () => Promise.resolve(),
    personas: inMemoryPersonas(personas),
    transactionally: savepointTransactionally(client, uuidv7),
    newId: uuidv7,
  });

  await client.query(
    `INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris'), ($2, 'Lyon', 'Lyon')`,
    [PARIS, LYON],
  );
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('mgrid-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'mgrid-a@t', $4, 'mgrid-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'mgrid-b@t', $4, 'mgrid-practice', 'manager'),
            ($3, 'Emma', 'Robert', 'mgrid-e@t', $5, 'mgrid-practice', 'manager')`,
    [ALICE, BRUNO, EMMA, PARIS, LYON],
  );
  await client.query(
    `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
       billing_address_postal_code, billing_address_city, billing_address_country)
     VALUES ($1, 'Banque Nationale de Test', '443061841', 'metropolitanFrance', '10 av', '75008',
             'Paris', 'France')`,
    [CLIENT],
  );
  await client.query(
    `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
     VALUES ($1, $2, 'Audit DORA', 'Regie', '2026-01-05')`,
    [MISSION, CLIENT],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $2, $3, '2026-01-05', NULL)`,
    [uuidv7(), ALICE, MISSION],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $2, $3, '2024-01-01', NULL)`,
    [uuidv7(), ALICE, BRUNO],
  );

  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA_JUNE, ALICE, PARIS],
  );
  await client.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, '2026-06-11', 'worked', $3, 4)`,
    [uuidv7(), CRA_JUNE, MISSION],
  );
});

afterEach(async () => {
  await app.close();
});

interface GridBody {
  readonly consultantId: string;
  readonly consultantName: string;
  readonly craId: string | null;
  readonly status: string | null;
  readonly days: readonly { readonly date: string }[];
  readonly missions: readonly { readonly missionId: string; readonly name: string }[];
  readonly editable: boolean;
}

describe('GET /api/v1/consultants/:consultantId/cras/:period/grid', () => {
  it("answers Alice's June grid to her own manager, named", async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/cras/2026-06/grid`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<GridBody>();

    expect(body.consultantId).toBe(ALICE);
    expect(body.consultantName).toBe('Alice Martin');
    expect(body.craId).toBe(CRA_JUNE);
    expect(body.status).toBe('submitted');
    expect(body.days).toHaveLength(30);
    expect(body.missions).toContainEqual(
      expect.objectContaining({ missionId: MISSION, name: 'Audit DORA' }),
    );
  });

  it('answers an empty, not-yet-started month rather than a 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/cras/2026-08/grid`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<GridBody>();
    expect(body.craId).toBeNull();
    expect(body.status).toBeNull();
    // Still staffed on the mission in August (open-ended assignment).
    expect(body.missions.length).toBeGreaterThan(0);
  });

  it('refuses a manager of another office — the ADR-0071 negative case, on a month WITH a Cra', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/cras/2026-06/grid`,
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      type: '/problems/out-of-scope',
      deniedBy: '/problems/out-of-scope',
    });
    // ADR-0042: a 403 names nothing about the record it hid.
    expect(response.body).not.toContain('Audit DORA');
    expect(response.body).not.toContain('Alice');
  });

  it('refuses a manager of another office on a month with NO Cra at all — the gap ADR-0071 closes', async () => {
    // The exact scenario `PgCraRepository.findByConsultantAndPeriod`'s own scope check cannot see
    // on its own: no row exists for August, so a check that only ran after a row was found would
    // silently answer 200 here. `craGridComposition` resolves the consultant's office first and
    // asserts scope before anything else is read.
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/cras/2026-08/grid`,
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/out-of-scope' });
    expect(response.body).not.toContain('Audit DORA');
  });

  it('answers a 404 for a consultant id that names nobody', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/mgrid-nobody/cras/2026-06/grid`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ type: '/problems/not-found' });
  });

  it('refuses a consultant: this route is manager-only', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/cras/2026-06/grid`,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it('refuses a request with no persona at all', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/cras/2026-06/grid`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ type: '/problems/no-persona' });
  });
});
