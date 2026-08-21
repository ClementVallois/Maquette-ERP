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
 * `/api/v1` through `fastify.inject`, against a real Postgres.
 *
 * This is where ADR-0003's demonstration finally has both beats. Beat one — the out-of-scope
 * record is **absent from the list** — was provable at the repository. Beat two — "a direct API
 * call on its URL is refused with a **403 that names the rule** that denied it" — needed an API,
 * and Phase 3's checkpoint recorded it as owed here by name.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'k'.repeat(40);

const PARIS = 'api-office-paris';
const LYON = 'api-office-lyon';
const ALICE = 'api-alice';
const BRUNO = 'api-bruno';
const EMMA = 'api-emma';
const HENRI = 'api-henri';
const CHLOE = 'api-chloe';
const GRADE = 'api-grade';
const MISSION = 'api-mission';
const CLIENT = 'api-client';
const CRA = 'api-cra';
// A second consultant of the **same** office, on a mission sold to a second client. Two records
// that differ only in whose they are is what makes a scope refusal provable rather than assumed,
// and ADR-0038 turns the second client into a second invoice.
const MISSION_TWO = 'api-mission-2';
const CLIENT_TWO = 'api-client-2';
const CRA_TWO = 'api-cra-2';

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
  {
    key: 'consultant-paris-2',
    role: 'consultant',
    consultantId: CHLOE,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Chloé Dubois',
  },
];

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

function writingAs(key: string): { cookie: string; origin: string } {
  return { ...as(key), origin: ORIGIN };
}

let app: FastifyInstance;

/** Every workable day of June 2026 on one mission — the shape `submit` requires. */
function workedDaysOfJune(): string[] {
  const days: string[] = [];
  for (let day = 1; day <= 30; day++) {
    const iso = `2026-06-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    if (weekday === 0 || weekday === 6 || iso === '2026-06-01') continue;
    days.push(iso);
  }

  return days;
}

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
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('api-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'api-a@t', $5, 'api-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'api-b@t', $5, 'api-practice', 'manager'),
            ($3, 'Emma', 'Robert', 'api-e@t', $6, 'api-practice', 'manager'),
            ($4, 'Henri', 'Laurent', 'api-h@t', $5, 'api-practice', 'director'),
            ($7, 'Chloé', 'Dubois', 'api-c@t', $5, 'api-practice', 'consultant')`,
    [ALICE, BRUNO, EMMA, HENRI, PARIS, LYON, CHLOE],
  );
  // The grade is created here and not borrowed from `public.grades` with a `SELECT … LIMIT 1`.
  // The integration job migrates and does **not** seed, so that table is empty in CI: the INSERT
  // matched no row, Alice had no `Cjm`, and the economics route answered 500 — while the same test
  // passed on any machine whose development database happened to be seeded.
  await client.query(`INSERT INTO public.grades (id, name, rank) VALUES ($1, 'Confirmé', 500)`, [
    GRADE,
  ]);
  await client.query(
    `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, to_date, cjm_cents)
     VALUES ($1, $2, $3, '2024-01-01', NULL, 25000)`,
    [uuidv7(), ALICE, GRADE],
  );
  await client.query(
    `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
       billing_address_postal_code, billing_address_city, billing_address_country)
     VALUES ($1, 'Banque Nationale de Test', '443061841', 'metropolitanFrance', '10 av', '75008', 'Paris', 'France'),
            ($2, 'Zenith Industries', '552081317', 'metropolitanFrance', '2 rue', '69002', 'Lyon', 'France')`,
    [CLIENT, CLIENT_TWO],
  );
  await client.query(
    `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
     VALUES ($1, $2, 'Audit DORA', 'Regie', '2026-01-05'),
            ($3, $4, 'SOC run', 'Regie', '2026-01-05')`,
    [MISSION, CLIENT, MISSION_TWO, CLIENT_TWO],
  );
  await client.query(
    `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
     VALUES ($1, $2, '2026-01-05', NULL, 85000),
            ($3, $4, '2026-01-05', NULL, 85000)`,
    [uuidv7(), MISSION, uuidv7(), MISSION_TWO],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $2, $3, '2026-01-05', NULL),
            ($4, $5, $6, '2026-01-05', NULL)`,
    [uuidv7(), ALICE, MISSION, uuidv7(), CHLOE, MISSION_TWO],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $2, $3, '2024-01-01', NULL),
            ($4, $5, $6, '2024-01-01', NULL)`,
    [uuidv7(), ALICE, BRUNO, uuidv7(), CHLOE, BRUNO],
  );
  await client.query(
    `INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
       intra_community_vat_number, rcs_registration, address_street, address_postal_code,
       address_city, address_country, number_prefix)
     VALUES ('api-entity', 'SecureCo SAS', 'SAS', 10000000, '732829320', 'FR27732829320',
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'SEC')`,
  );
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z'),
            ($4, $5, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA, ALICE, PARIS, CRA_TWO, CHLOE],
  );
  for (const day of workedDaysOfJune()) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, half_days)
       VALUES ($1, $2, $3, 'worked', $4, 2), ($5, $6, $3, 'worked', $7, 2)`,
      [uuidv7(), CRA, day, MISSION, uuidv7(), CRA_TWO, MISSION_TWO],
    );
  }
});

afterEach(async () => {
  await app.close();
});

describe('ADR-0003, both beats', () => {
  it('beat one: the out-of-scope Cra is absent from the list, and nothing says why', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras',
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ cras: unknown[] }>().cras).toStrictEqual([]);
  });

  it('beat two: the same record by URL is a 403 that names the rule that denied it', async () => {
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/cras/${CRA}`,
      headers: as('manager-lyon'),
    });

    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({
      type: '/problems/out-of-scope',
      deniedBy: '/problems/out-of-scope',
    });
    // And it describes nothing about what it is hiding (ADR-0042).
    expect(denied.body).not.toContain(PARIS);
    expect(denied.body).not.toContain(ALICE);
  });

  it('the same URL under the office that owns it answers 200', async () => {
    // The half that makes the 403 mean something: the URL is right, the record is there, and the
    // only difference between the two answers is who asked.
    const allowed = await app.inject({
      method: 'GET',
      url: `/api/v1/cras/${CRA}`,
      headers: as('manager-paris'),
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.json<{ id: string }>().id).toBe(CRA);
  });

  it('tells "not yours" and "does not exist" apart', async () => {
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/cras/api-nothing',
      headers: as('manager-paris'),
    });

    expect(missing.statusCode).toBe(404);
  });

  it("refuses a consultant a colleague's Cra, in their own office", async () => {
    // Same office, same role, same URL: `cra: 'own'` is the only thing between the two answers,
    // so this is the scope dimension that the office check cannot stand in for.
    const colleague = await app.inject({
      method: 'GET',
      url: `/api/v1/cras/${CRA}`,
      headers: as('consultant-paris-2'),
    });

    expect(colleague.statusCode).toBe(403);
    expect(colleague.json()).toMatchObject({
      type: '/problems/out-of-scope',
      deniedBy: '/problems/out-of-scope',
    });
    expect(colleague.body).not.toContain(ALICE);

    const own = await app.inject({
      method: 'GET',
      url: `/api/v1/cras/${CRA}`,
      headers: as('consultant-paris'),
    });

    expect(own.statusCode).toBe(200);
  });
});

describe('the chain, through the API', () => {
  it('validates a Cra and answers with the drafted invoices', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/validation`,
      headers: writingAs('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ replayed: boolean; invoices: { status: string }[] }>();
    expect(body.replayed).toBe(false);
    expect(body.invoices).toHaveLength(1);
    expect(body.invoices[0]!.status).toBe('draft');
  });

  it('replays as 200 with the same documents, never a 409', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/validation`,
      headers: writingAs('manager-paris'),
    });
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/validation`,
      headers: writingAs('manager-paris'),
    });

    expect(again.statusCode).toBe(200);
    expect(again.json<{ replayed: boolean }>().replayed).toBe(true);
    expect(again.json<{ invoices: { id: string }[] }>().invoices).toStrictEqual(
      first.json<{ invoices: { id: string }[] }>().invoices,
    );
  });

  it('refuses a consultant the validation route on its role alone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/validation`,
      headers: writingAs('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it('issues the invoice, and refuses to issue it twice under a new key', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/validation`,
      headers: writingAs('manager-paris'),
    });
    const invoices = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: as('billing-paris'),
    });
    const invoiceId = invoices.json<{ invoices: { id: string }[] }>().invoices[0]!.id;

    const issued = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${invoiceId}/issuance`,
      headers: { ...writingAs('billing-paris'), 'idempotency-key': 'issuance-key-0001' },
    });

    expect(issued.statusCode).toBe(200);
    expect(issued.json<{ invoiceNumber: string }>().invoiceNumber).toMatch(/^SEC-2026-\d{6}$/u);

    // A different key on an already-issued document is a conflict, not a second number: the
    // document state machine is what refuses, and the series stays gapless.
    const twice = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${invoiceId}/issuance`,
      headers: { ...writingAs('billing-paris'), 'idempotency-key': 'issuance-key-0002' },
    });

    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ type: '/problems/invoice-transition-not-allowed' });
  });

  it('answers the original document when the same key is replayed', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/validation`,
      headers: writingAs('manager-paris'),
    });
    const invoices = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: as('billing-paris'),
    });
    const invoiceId = invoices.json<{ invoices: { id: string }[] }>().invoices[0]!.id;
    const headers = { ...writingAs('billing-paris'), 'idempotency-key': 'issuance-key-0003' };

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${invoiceId}/issuance`,
      headers,
    });
    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${invoiceId}/issuance`,
      headers,
    });

    expect(retry.statusCode).toBe(200);
    expect(retry.json<{ replayed: boolean }>().replayed).toBe(true);
    expect(retry.json<{ invoiceNumber: string }>().invoiceNumber).toBe(
      first.json<{ invoiceNumber: string }>().invoiceNumber,
    );
  });

  it('refuses a key that already issued a different invoice, and leaves that one a draft', async () => {
    // ADR-0044's contract is "same key, **same invoice**". A key that has already issued another
    // document is a client bug, not a retry: replaying the first document's number here would
    // report success for an invoice that was never issued, and it would never be issued after.
    for (const cra of [CRA, CRA_TWO]) {
      await app.inject({
        method: 'POST',
        url: `/api/v1/cras/${cra}/validation`,
        headers: writingAs('manager-paris'),
      });
    }
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: as('billing-paris'),
    });
    const [first, second] = listed.json<{ invoices: { id: string }[] }>().invoices;
    const headers = { ...writingAs('billing-paris'), 'idempotency-key': 'issuance-key-0004' };

    const issued = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${first!.id}/issuance`,
      headers,
    });
    expect(issued.statusCode).toBe(200);

    const reused = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${second!.id}/issuance`,
      headers,
    });

    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toMatchObject({ type: '/problems/idempotency-key-reused' });
    // Not the first invoice's number under the second invoice's id, which is the silent failure.
    expect(reused.json<{ invoiceNumber?: string }>().invoiceNumber).toBeUndefined();

    const untouched = await app.inject({
      method: 'GET',
      url: `/api/v1/invoices/${second!.id}`,
      headers: as('billing-paris'),
    });

    expect(untouched.json<{ status: string }>().status).toBe('draft');
    expect(untouched.json<{ invoiceNumber: string | null }>().invoiceNumber).toBeNull();
  });

  it('refuses an issuance with no Idempotency-Key', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/invoices/api-anything/issuance',
      headers: writingAs('billing-paris'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ type: '/problems/idempotency-key-required' });
  });
});

describe('the progressive-disclosure read', () => {
  it('serves Tjm, Cjm and margin to a manager of the right office', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/economics?period=2026-06`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ cjmCents: number; marginCents: number; missions: unknown[] }>();
    expect(body.cjmCents).toBe(25000);
    // 21 workable days in June 2026, at 850 € sold and 250 € cost.
    expect(body.marginCents).toBe(21 * (85000 - 25000));
  });

  it('refuses a manager of another office, naming the rule', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/economics?period=2026-06`,
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ deniedBy: '/problems/out-of-scope' });
  });

  it('refuses billing, in its own office — the role dimension on its own', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/economics?period=2026-06`,
      headers: as('billing-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it('never puts Cjm in a list projection, which is what makes the extra request the control', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/validation`,
      headers: writingAs('manager-paris'),
    });

    for (const url of ['/api/v1/cras', '/api/v1/invoices']) {
      const list = await app.inject({ method: 'GET', url, headers: as('manager-paris') });

      // The spellings this codebase actually uses. Phase 3 shipped this assertion against `tjm`
      // and `cjm`, which appear nowhere, so a real leak named `tjmCents` would have passed.
      expect(list.body).not.toContain('cjmCents');
      expect(list.body).not.toContain('tjmCents');
      expect(list.body).not.toContain('marginCents');
    }
  });
});

describe('pagination', () => {
  it('refuses a page size past the cap rather than silently narrowing it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?limit=1000',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ errors: Record<string, string[]> }>().errors).toHaveProperty('limit');
  });

  it('accepts the cap itself', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?limit=50',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
  });
});
