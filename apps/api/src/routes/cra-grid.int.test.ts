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
 * `GET /api/v1/cras/:period/grid` (front-end plan Phase 5.2): the month's calendar skeleton, the missions
 * this consultant is staffed on, and the Cra that already exists for the month, as JSON — the same
 * `craGridComposition` the entry-grid screen renders (ADR-0065), a different representation.
 *
 * Alice's June carries the three shapes `docs/frontend-plan.md` § 5.2 names by name: a day split
 * across two missions (11/06), a recorded absence (18/06), and a worked Saturday the calendar
 * still flags (13/06) — the same three the seed's own `VARIED_MONTH` constant documents.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'g'.repeat(40);

const PARIS = 'gridapi-office-paris';
const ALICE = 'gridapi-alice';
const BRUNO = 'gridapi-bruno';
const MISSION_A = 'gridapi-mission-a';
const MISSION_B = 'gridapi-mission-b';
const CLIENT = 'gridapi-client';
const CRA_JUNE = 'gridapi-cra-june';
const CRA_MAY = 'gridapi-cra-may';

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

  await client.query(`INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris')`, [
    PARIS,
  ]);
  await client.query(
    `INSERT INTO public.practices (id, name) VALUES ('gridapi-practice', 'Audit')`,
  );
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'gridapi-a@t', $3, 'gridapi-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'gridapi-b@t', $3, 'gridapi-practice', 'manager')`,
    [ALICE, BRUNO, PARIS],
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
     VALUES ($1, $3, 'Audit DORA', 'Regie', '2026-01-05'),
            ($2, $3, 'SOC Run', 'Regie', '2026-01-05')`,
    [MISSION_A, MISSION_B, CLIENT],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $3, $4, '2026-01-05', NULL), ($2, $3, $5, '2026-01-05', NULL)`,
    [uuidv7(), uuidv7(), ALICE, MISSION_A, MISSION_B],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $2, $3, '2024-01-01', NULL)`,
    [uuidv7(), ALICE, BRUNO],
  );

  // June: submitted, carrying the split day, the absence and the flagged Saturday — inserted
  // directly, the way `web/pre-facturier.int.test.ts` seeds a Cra, rather than through the write
  // path: this file is about the read, not about how a Cra reaches this shape.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA_JUNE, ALICE, PARIS],
  );
  await client.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, half_days)
     VALUES ($1, $5, '2026-06-11', 'worked', $2, 1),
            ($3, $5, '2026-06-11', 'worked', $4, 1),
            ($6, $5, '2026-06-18', 'absence', NULL, 2),
            ($7, $5, '2026-06-13', 'worked', $2, 2)`,
    [uuidv7(), MISSION_A, uuidv7(), MISSION_B, CRA_JUNE, uuidv7(), uuidv7()],
  );
  await client.query(
    `INSERT INTO timesheet.cra_flags (id, cra_id, day, reason) VALUES ($1, $2, '2026-06-13', 'weekend')`,
    [uuidv7(), CRA_JUNE],
  );

  // May: refused, with a reason — the third shape 5.2's own text names ("motif de refus").
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status,
       refusal_by, refusal_at, refusal_reason)
     VALUES ($1, $2, $3, '2026-05', 'refused', $2, '2026-06-01T09:00:00Z', 'jours incomplets')`,
    [CRA_MAY, ALICE, PARIS],
  );
});

afterEach(async () => {
  await app.close();
});

interface GridBody {
  readonly period: string;
  readonly craId: string | null;
  readonly status: string | null;
  readonly days: readonly { readonly date: string; readonly nonWorkable: string | null }[];
  readonly missions: readonly {
    readonly missionId: string;
    readonly name: string;
    readonly clientName: string;
  }[];
  readonly lines: readonly {
    readonly day: string;
    readonly dayType: string;
    readonly missionId: string | null;
    readonly halfDays: number;
  }[];
  readonly flags: readonly { readonly day: string; readonly reason: string }[];
  readonly refusal: { readonly reason: string } | null;
  readonly editable: boolean;
}

describe('GET /api/v1/cras/:period/grid', () => {
  it('answers the month skeleton, the assigned missions and the recorded lines', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras/2026-06/grid',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<GridBody>();

    expect(body.period).toBe('2026-06');
    expect(body.craId).toBe(CRA_JUNE);
    expect(body.status).toBe('submitted');
    expect(body.editable).toBe(false);
    expect(body.refusal).toBeNull();

    // 30 June days, every one accounted for.
    expect(body.days).toHaveLength(30);
    const saturday = body.days.find((day) => day.date === '2026-06-13');
    expect(saturday?.nonWorkable).toBe('weekend');
    const thursday = body.days.find((day) => day.date === '2026-06-11');
    expect(thursday?.nonWorkable).toBeNull();

    expect(body.missions).toStrictEqual(
      expect.arrayContaining([
        { missionId: MISSION_A, name: 'Audit DORA', clientName: 'Banque Nationale de Test' },
        { missionId: MISSION_B, name: 'SOC Run', clientName: 'Banque Nationale de Test' },
      ]),
    );

    // The split day: one line per mission, one half-day each.
    const splitDayLines = body.lines.filter((line) => line.day === '2026-06-11');
    expect(splitDayLines).toHaveLength(2);
    expect(splitDayLines.every((line) => line.halfDays === 1)).toBe(true);

    // The absence: recorded, no mission.
    expect(body.lines).toContainEqual({
      day: '2026-06-18',
      dayType: 'absence',
      missionId: null,
      halfDays: 2,
    });

    // The worked Saturday: recorded as a normal worked line, and separately flagged.
    expect(body.lines).toContainEqual({
      day: '2026-06-13',
      dayType: 'worked',
      missionId: MISSION_A,
      halfDays: 2,
    });
    expect(body.flags).toStrictEqual([{ day: '2026-06-13', reason: 'weekend' }]);
  });

  it('answers an empty month with no Cra rather than refusing it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras/2026-08/grid',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<GridBody>();

    expect(body.craId).toBeNull();
    expect(body.status).toBeNull();
    expect(body.lines).toStrictEqual([]);
    expect(body.flags).toStrictEqual([]);
    expect(body.refusal).toBeNull();
    expect(body.editable).toBe(true);
    // Still open-ended assignments in August, so the mission picker is not empty.
    expect(body.missions.length).toBeGreaterThan(0);
    expect(body.days).toHaveLength(31);
  });

  it('carries the refusal reason on a refused month', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras/2026-05/grid',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<GridBody>();
    expect(body.craId).toBe(CRA_MAY);
    expect(body.status).toBe('refused');
    expect(body.editable).toBe(true);
    expect(body.refusal).toStrictEqual({ reason: 'jours incomplets' });
  });

  it('refuses a manager: the role does not carry this action', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras/2026-06/grid',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it('refuses a request with no persona at all', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/cras/2026-06/grid' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ type: '/problems/no-persona' });
  });
});
