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
 * `GET /api/v1/pre-facturier` (front-end plan Phase 5.1), the JSON mirror of the pré-facturier screen
 * (ADR-0053, ADR-0065): same composition, a different representation.
 *
 * Fixture shape borrowed on purpose from `web/pre-facturier.int.test.ts` (a Forfait day inside an
 * otherwise Regie month, so validating produces both an invoice and a declined-days blocking
 * reason) — the composition under test is the same function, and reusing the same shape is what
 * lets this file assert numbers it can derive by construction rather than invent.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'q'.repeat(40);

const PARIS = 'pfapi-office-paris';
const LYON = 'pfapi-office-lyon';
const ALICE = 'pfapi-alice';
const CHLOE = 'pfapi-chloe';
const BRUNO = 'pfapi-bruno';
const HENRI = 'pfapi-henri';
const EMMA = 'pfapi-emma';
const MISSION = 'pfapi-mission';
const FORFAIT = 'pfapi-mission-forfait';
const CLIENT = 'pfapi-client';
const ENTITY = 'pfapi-entity';
const CRA_ALICE = 'pfapi-cra-alice';
const CRA_CHLOE = 'pfapi-cra-chloe';

/** July 2026 for the clock, so June is a closed month and its unvalidated days are late. */
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
    key: 'manager-paris',
    role: 'manager',
    consultantId: BRUNO,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Bruno Leroy',
  },
  {
    key: 'billing-paris',
    role: 'billing',
    consultantId: HENRI,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Henri Dubois',
  },
  {
    key: 'manager-lyon',
    role: 'manager',
    consultantId: EMMA,
    officeId: LYON,
    officeName: 'Lyon',
    displayName: 'Emma Roux',
  },
  {
    key: 'consultant-paris',
    role: 'consultant',
    consultantId: ALICE,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Alice Martin',
  },
];

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

function writingAs(key: string): { cookie: string; origin: string } {
  return { ...as(key), origin: ORIGIN };
}

/** Every workable day of June 2026 — the 1st is Pentecost Monday and is not one. 21 days. */
function workedDaysOfJune(): string[] {
  const days: string[] = [];
  for (let day = 2; day <= 30; day += 1) {
    const iso = `2026-06-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(iso);
  }

  return days;
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
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('pfapi-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'pfapi-a@t', $5, 'pfapi-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'pfapi-b@t', $5, 'pfapi-practice', 'manager'),
            ($3, 'Chloé', 'Nguyen', 'pfapi-c@t', $5, 'pfapi-practice', 'consultant'),
            ($4, 'Henri', 'Dubois', 'pfapi-h@t', $5, 'pfapi-practice', 'manager'),
            ($6, 'Emma', 'Roux', 'pfapi-e@t', $7, 'pfapi-practice', 'manager')`,
    [ALICE, BRUNO, CHLOE, HENRI, PARIS, EMMA, LYON],
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
            ($2, $3, 'Refonte SOC', 'Forfait', '2026-01-05')`,
    [MISSION, FORFAIT, CLIENT],
  );
  await client.query(
    `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
     VALUES ($1, $2, '2026-01-05', NULL, 85000)`,
    [uuidv7(), MISSION],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $4, $5, '2026-01-05', NULL), ($2, $4, $6, '2026-01-05', NULL),
            ($3, $7, $5, '2026-01-05', NULL)`,
    [uuidv7(), uuidv7(), uuidv7(), ALICE, MISSION, FORFAIT, CHLOE],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $3, $4, '2024-01-01', NULL), ($2, $5, $4, '2024-01-01', NULL)`,
    [uuidv7(), uuidv7(), ALICE, BRUNO, CHLOE],
  );
  await client.query(
    `INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
       intra_community_vat_number, rcs_registration, address_street, address_postal_code,
       address_city, address_country, number_prefix)
     VALUES ($1, 'SecureCo SAS', 'SAS', 10000000, '732829320', 'FR27732829320',
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'PFA')`,
    [ENTITY],
  );

  // Alice's June: submitted, one day on the Forfait mission (declined at validation, ADR-0037) and
  // the rest of the month's 21 workable days on the Regie mission.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA_ALICE, ALICE, PARIS],
  );
  const [firstDay = '', ...regieDays] = workedDaysOfJune();
  await client.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, $3, 'worked', $4, 4)`,
    [uuidv7(), CRA_ALICE, firstDay, FORFAIT],
  );
  for (const day of regieDays) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, 4)`,
      [uuidv7(), CRA_ALICE, day, MISSION],
    );
  }

  // Chloé's June: still a draft when July opens — five quarter-days, none of them validated,
  // which is what ADR-0054's late-days counter counts.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
     VALUES ($1, $2, $3, '2026-06', 'draft')`,
    [CRA_CHLOE, CHLOE, PARIS],
  );
  await client.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, '2026-06-02', 'worked', $3, 4), ($4, $2, '2026-06-03', 'worked', $3, 1)`,
    [uuidv7(), CRA_CHLOE, MISSION, uuidv7()],
  );
});

afterEach(async () => {
  await app.close();
});

/** Validates Alice's June through the API, which is what puts a draft invoice on the read. */
async function validateAliceJune(): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/cras/${CRA_ALICE}/validation`,
    headers: writingAs('manager-paris'),
  });

  expect(response.statusCode).toBe(200);
}

interface PreFacturierBody {
  readonly period: string;
  readonly summary: {
    readonly billableCents: number;
    readonly lateDays: number;
    readonly craCount: number;
  };
  readonly invoices: readonly {
    readonly id: string;
    readonly status: string;
    readonly supplyPeriod: string;
    readonly billedToName: string;
    readonly invoiceNumber: string | null;
    readonly issueDate: string | null;
    readonly totalTtcCents: number | null;
  }[];
  readonly cras: readonly {
    readonly craId: string;
    readonly consultantId: string;
    readonly consultantName: string;
    readonly status: string;
    readonly late: boolean;
    readonly recordedQuarterDays: number;
    readonly blockingReasons: readonly string[];
    readonly decidable: boolean;
  }[];
}

describe('GET /api/v1/pre-facturier', () => {
  it('answers the summary, the invoices and the Cra rows for the requested period', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<PreFacturierBody>();

    expect(body.period).toBe('2026-06');
    // 20 Regie days (21 workable minus the one on the Forfait mission) at 850 € = 17 000 € HT.
    expect(body.summary.billableCents).toBe(1_700_000);
    // Chloé's five quarter-days: draft, unvalidated, and June has closed by the clock's July.
    expect(body.summary.lateDays).toBe(5);
    expect(body.summary.craCount).toBe(2);

    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]).toMatchObject({
      status: 'draft',
      supplyPeriod: '2026-06',
      billedToName: 'Banque Nationale de Test',
      invoiceNumber: null,
      issueDate: null,
      totalTtcCents: null,
    });

    const alice = body.cras.find((row) => row.consultantId === ALICE);
    expect(alice).toMatchObject({
      status: 'validated',
      late: false,
      recordedQuarterDays: 21 * 4,
      blockingReasons: ['notRegie'],
      decidable: false,
    });

    const chloe = body.cras.find((row) => row.consultantId === CHLOE);
    expect(chloe).toMatchObject({
      status: 'draft',
      late: true,
      recordedQuarterDays: 5,
      blockingReasons: [],
      decidable: false,
    });
  });

  it('counts nothing late on the month still running (ADR-0054)', async () => {
    // Coverage moved here from the now-deleted `/pre-facturier` screen's own test (front-end
    // plan Phase 9.3/9.4): July, with the clock in July — nothing recorded this month is due yet.
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-07',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<PreFacturierBody>().summary.lateDays).toBe(0);
  });

  it('offers a submitted Cra as decidable to the manager who may act on it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
      headers: as('manager-paris'),
    });

    const alice = response.json<PreFacturierBody>().cras.find((row) => row.consultantId === ALICE);
    // Not yet validated in this test: still `submitted`, and that is exactly the state a manager
    // may decide on.
    expect(alice).toMatchObject({ status: 'submitted', decidable: true });
  });

  it('offers billing the same table with nothing decidable on it', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
      headers: as('billing-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<PreFacturierBody>();
    expect(body.cras.every((row) => !row.decidable)).toBe(true);
  });

  it('scopes a manager to their own office — Lyon sees none of Paris’s month', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<PreFacturierBody>();
    expect(body.cras).toStrictEqual([]);
    expect(body.invoices).toStrictEqual([]);
    expect(body.summary).toStrictEqual({ billableCents: 0, lateDays: 0, craCount: 0 });
  });

  it('refuses a request with no persona at all', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ type: '/problems/no-persona' });
  });

  it('refuses a consultant on the role dimension alone', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it('refuses a request with no period at all, before any module is called', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ type: '/problems/malformed-request' });
  });

  it('never carries a Tjm, a Cjm or a margin field, anywhere in the payload', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
      headers: as('manager-paris'),
    });

    expect(response.body).not.toContain('cjmCents');
    expect(response.body).not.toContain('tjmCents');
    expect(response.body).not.toContain('marginCents');
  });
});
