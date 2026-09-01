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
 * `GET /api/v1/dashboard` (front-end plan Phase 5.3): honest, role-scoped aggregates, computed from the same
 * repositories every other read already goes through — nothing invented for this endpoint, and
 * nothing that ever puts `Cjm`, `Tjm` or a margin field on the wire (BUILD-RULES § Authorization,
 * "never in a list", extended here to an aggregate view of the same protected asset).
 *
 * June 2026 has **22** workable days by the real calendar (verified directly against
 * `workingCalendar()` — `PUBLIC_HOLIDAYS` carries no June 2026 date, and 2026-06-01 is an ordinary
 * Monday, not a holiday), which is the number this file's `remainingWorkableDays` assertion is
 * built from — not the 21 a couple of sibling fixtures use for their own, unrelated reasons.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'd'.repeat(40);

const PARIS = 'dashapi-office-paris';
const ALICE = 'dashapi-alice';
const CHLOE = 'dashapi-chloe';
const BRUNO = 'dashapi-bruno';
const HENRI = 'dashapi-henri';
const MISSION = 'dashapi-mission';
const CLIENT = 'dashapi-client';
const ENTITY = 'dashapi-entity';
const CRA_ALICE = 'dashapi-cra-alice';
const CRA_CHLOE = 'dashapi-cra-chloe';

/** Every workable June 2026 day, per the real domain calendar (22 — see the file's own header). */
const WORKABLE_JUNE = [
  '2026-06-01',
  '2026-06-02',
  '2026-06-03',
  '2026-06-04',
  '2026-06-05',
  '2026-06-08',
  '2026-06-09',
  '2026-06-10',
  '2026-06-11',
  '2026-06-12',
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-22',
  '2026-06-23',
  '2026-06-24',
  '2026-06-25',
  '2026-06-26',
  '2026-06-29',
  '2026-06-30',
] as const;

/** July, so June has closed by the clock the dashboard's `lateCras` reads. */
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
    key: 'billing-paris',
    role: 'billing',
    consultantId: HENRI,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Henri Dubois',
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
    clock: { now: () => NOW },
    probeDatabase: () => Promise.resolve(),
    personas: inMemoryPersonas(personas),
    transactionally: savepointTransactionally(client, uuidv7),
    newId: uuidv7,
  });

  await client.query(`INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris')`, [
    PARIS,
  ]);
  await client.query(
    `INSERT INTO public.practices (id, name) VALUES ('dashapi-practice', 'Audit')`,
  );
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'dashapi-a@t', $5, 'dashapi-practice', 'consultant'),
            ($2, 'Chloé', 'Nguyen', 'dashapi-c@t', $5, 'dashapi-practice', 'consultant'),
            ($3, 'Bruno', 'Leroy', 'dashapi-b@t', $5, 'dashapi-practice', 'manager'),
            ($4, 'Henri', 'Dubois', 'dashapi-h@t', $5, 'dashapi-practice', 'director')`,
    [ALICE, CHLOE, BRUNO, HENRI, PARIS],
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
    `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
     VALUES ($1, $2, '2026-01-05', NULL, 80000)`,
    [uuidv7(), MISSION],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $3, $4, '2026-01-05', NULL), ($2, $5, $4, '2026-01-05', NULL)`,
    [uuidv7(), uuidv7(), ALICE, MISSION, CHLOE],
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
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'DSH')`,
    [ENTITY],
  );

  // Alice's June: a draft, five of the month's 22 workable days recorded — twenty quarter-days,
  // and seventeen days still not entered.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
     VALUES ($1, $2, $3, '2026-06', 'draft')`,
    [CRA_ALICE, ALICE, PARIS],
  );
  for (const day of WORKABLE_JUNE.slice(0, 5)) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, 4)`,
      [uuidv7(), CRA_ALICE, day, MISSION],
    );
  }

  // Chloé's June: submitted, the whole month recorded — this is the one a manager decides on and
  // the one that becomes an invoice.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA_CHLOE, CHLOE, PARIS],
  );
  for (const day of WORKABLE_JUNE) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, 4)`,
      [uuidv7(), CRA_CHLOE, day, MISSION],
    );
  }
});

afterEach(async () => {
  await app.close();
});

/** Validates Chloé's June, producing the draft invoice the manager/billing tests read. */
async function validateChloeJune(): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/cras/${CRA_CHLOE}/validation`,
    headers: writingAs('manager-paris'),
  });

  expect(response.statusCode).toBe(200);
}

async function dashboard(persona: string): Promise<Awaited<ReturnType<typeof app.inject>>> {
  return app.inject({
    method: 'GET',
    url: '/api/v1/dashboard?period=2026-06',
    headers: as(persona),
  });
}

describe('GET /api/v1/dashboard — consultant', () => {
  it('reports my month, in quarter-days and in days not yet entered', async () => {
    const response = await dashboard('consultant-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      role: 'consultant',
      myMonthStatus: 'draft',
      recordedQuarterDays: 20,
      remainingWorkableDays: 17,
      refusedPeriods: [],
    });
  });

  it('ADR-0082: names a refusal from another period, alongside the requested month', async () => {
    // Alice's May: refused, resolved neither way yet. Requesting June (her current draft) must
    // not make this disappear — the whole point of the fix.
    await transaction.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ($1, $2, $3, '2026-05', 'refused')`,
      [uuidv7(), ALICE, PARIS],
    );

    const response = await dashboard('consultant-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      period: '2026-06',
      myMonthStatus: 'draft',
      refusedPeriods: ['2026-05'],
    });
  });
});

describe('GET /api/v1/dashboard — manager', () => {
  it('counts a submitted month awaiting a decision, before anything is validated', async () => {
    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      role: 'manager',
      pendingDecisions: 1,
      billableCents: 0,
      // Both Cras are unvalidated in a month the clock has closed (ADR-0054).
      lateCras: 2,
    });
  });

  it('moves the figures once the month is validated', async () => {
    await validateChloeJune();

    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      role: 'manager',
      pendingDecisions: 0,
      // 22 days × 800 € = 17 600 € HT.
      billableCents: 1_760_000,
      lateCras: 1,
    });
  });

  it('ADR-0082: counts a decision pending in another period too, requested period unchanged', async () => {
    // Chloé's May: submitted, decided by nobody yet — a month before the one requested below.
    // Before this fix, a manager viewing June never learned this existed.
    await transaction.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ($1, $2, $3, '2026-05', 'submitted')`,
      [uuidv7(), CHLOE, PARIS],
    );

    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      period: '2026-06',
      // Chloé's June, plus Chloé's May.
      pendingDecisions: 2,
      // 22 workable June days × 800 € — the requested period's own total, unaffected by May.
      billableCents: 0,
    });
  });
});

describe('GET /api/v1/dashboard — billing', () => {
  it('counts drafts before an issuance', async () => {
    await validateChloeJune();

    const response = await dashboard('billing-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      role: 'billing',
      draftInvoices: 1,
      issuedInvoices: 0,
      totalTtcIssuedCents: 0,
    });
  });

  it('moves the invoice from draft to issued, and sums its TTC total', async () => {
    await validateChloeJune();

    // `GET /api/v1/invoices` takes no `period` (Annex A only lists `limit`/`offset` for it); this
    // fixture holds exactly one invoice, so the plain list already answers the one this test wants.
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: as('billing-paris'),
    });
    const invoiceId = listed.json<{ invoices: { id: string }[] }>().invoices[0]!.id;

    const issued = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${invoiceId}/issuance`,
      headers: { ...writingAs('billing-paris'), 'idempotency-key': 'dashboard-issuance-0001' },
    });
    expect(issued.statusCode).toBe(200);

    const response = await dashboard('billing-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      role: 'billing',
      draftInvoices: 0,
      issuedInvoices: 1,
      // 17 600 € HT × 1,20 = 21 120 € TTC.
      totalTtcIssuedCents: 2_112_000,
    });
  });
});

describe('GET /api/v1/dashboard — the Gate: no margin field, for any role', () => {
  it('never carries Cjm, Tjm or a margin field, on any of the three payloads', async () => {
    await validateChloeJune();

    for (const persona of ['consultant-paris', 'manager-paris', 'billing-paris']) {
      const response = await dashboard(persona);

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('cjmCents');
      expect(response.body).not.toContain('tjmCents');
      expect(response.body).not.toContain('marginCents');
      expect(response.body).not.toContain('cjm');
      expect(response.body).not.toContain('margin');
    }
  });
});

describe('the edges of the dashboard', () => {
  it('refuses a request with no persona at all', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard?period=2026-06' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ type: '/problems/no-persona' });
  });

  it('refuses a request with no period, before any module is called', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ type: '/problems/malformed-request' });
  });
});
