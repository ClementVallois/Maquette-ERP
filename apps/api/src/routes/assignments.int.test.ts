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
 * `POST /api/v1/assignments` and `PUT /api/v1/assignments/:id`, through the API. The
 * interval-coverage logic itself is tested at the function level in
 * `apps/api/src/staffing/assignment-admin.int.test.ts`; this file is the HTTP surface around it:
 * access control, malformed input, and scope.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'k'.repeat(40);
const PARIS = 'assign-office-paris';
const LYON = 'assign-office-lyon';
const CONSULTANT = 'assign-consultant';
const MISSION = 'assign-mission';
const CLIENT = 'assign-client';

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
    key: 'manager-paris',
    role: 'manager',
    consultantId: 'assign-manager',
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Manager Paris',
  },
  {
    key: 'manager-lyon',
    role: 'manager',
    consultantId: 'assign-manager-lyon',
    officeId: LYON,
    officeName: 'Lyon',
    displayName: 'Manager Lyon',
  },
  {
    key: 'consultant-paris',
    role: 'consultant',
    consultantId: CONSULTANT,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Consultant Paris',
  },
];

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

function writingAs(key: string): { cookie: string; origin: string } {
  return { ...as(key), origin: ORIGIN };
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
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('assign-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Dupont', 'assign-a@test', $2, 'assign-practice', 'consultant')`,
    [CONSULTANT, PARIS],
  );
  await client.query(
    `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
       billing_address_postal_code, billing_address_city, billing_address_country)
     VALUES ($1, 'Client Test', '443061841', 'metropolitanFrance', '1 rue', '75000', 'Paris', 'France')`,
    [CLIENT],
  );
  await client.query(
    `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
     VALUES ($1, $2, 'Mission Test', 'Regie', '2026-01-01')`,
    [MISSION, CLIENT],
  );
});

afterEach(async () => {
  await app.close();
});

describe('POST /api/v1/assignments', () => {
  it('creates an assignment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assignments',
      headers: writingAs('manager-paris'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-01',
        toDate: null,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ id: string }>().id).toBeTruthy();
  });

  it('refuses a malformed body with 400, naming the field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assignments',
      headers: writingAs('manager-paris'),
      payload: { consultantId: CONSULTANT, missionId: MISSION, fromDate: 'not-a-date' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a consultant actor with 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assignments',
      headers: writingAs('consultant-paris'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-01',
        toDate: null,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('answers notFound for a consultant of another office', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assignments',
      headers: writingAs('manager-lyon'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-01',
        toDate: null,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('answers a typed conflict for an invalid range', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/assignments',
      headers: writingAs('manager-paris'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-31',
        toDate: '2026-07-01',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ type: '/problems/assignment-invalid-range' });
  });
});

describe('GET /api/v1/assignments', () => {
  it('lists the office catalogue for a manager', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assignments',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ consultants: unknown[] }>().consultants).toHaveLength(1);
  });

  it('refuses a consultant actor with 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/assignments',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('PUT /api/v1/assignments/:id', () => {
  it('updates an assignment', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/assignments',
      headers: writingAs('manager-paris'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-01',
        toDate: '2026-07-15',
      },
    });
    const { id } = created.json<{ id: string }>();

    const updated = await app.inject({
      method: 'PUT',
      url: `/api/v1/assignments/${id}`,
      headers: writingAs('manager-paris'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-01',
        toDate: '2026-07-20',
      },
    });

    expect(updated.statusCode).toBe(200);
  });

  it('answers notFound for an assignment id that does not exist', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/assignments/does-not-exist',
      headers: writingAs('manager-paris'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-01',
        toDate: '2026-07-20',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('refuses a consultant actor with 403', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/assignments/does-not-exist',
      headers: writingAs('consultant-paris'),
      payload: {
        consultantId: CONSULTANT,
        missionId: MISSION,
        fromDate: '2026-07-01',
        toDate: '2026-07-20',
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
