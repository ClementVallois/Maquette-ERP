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
// A consultant who has left the firm (ADR-0079) — present in `public.consultants`, absent from the
// office roster item 7's picker builds, but never touched otherwise: this file's fixtures do not
// depend on them existing, so most tests never reference this id at all.
const DEPARTED = 'api-departed';
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

/** July 2026, for the month the write tests create: the seeded Cra above is June's. */
function workedDaysOfJuly(): string[] {
  const days: string[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const iso = `2026-07-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && iso !== '2026-07-14') days.push(iso);
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
  await client.query(
    `INSERT INTO public.consultants
       (id, first_name, last_name, email, office_id, practice_id, role, departure_date)
     VALUES ($1, 'Denis', 'Sorel', 'api-d@t', $2, 'api-practice', 'consultant', '2026-01-31')`,
    [DEPARTED, PARIS],
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
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, 4), ($5, $6, $3, 'worked', $7, 4)`,
      [uuidv7(), CRA, day, MISSION, uuidv7(), CRA_TWO, MISSION_TWO],
    );
  }
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/v1/calendar', () => {
  it("answers the working calendar's own coverage", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/calendar',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
    // ADR-0004: a written table, 2026 only, today — asserted as "contains 2026" rather than
    // "equals [2026]" so this test does not itself need editing the day a second year is added.
    expect(response.json<{ years: number[] }>().years).toContain(2026);
  });

  it('refuses a request with no persona at all', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/calendar' });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/v1/cras — consultantName (ADR-0071)', () => {
  it("names each row's consultant, for a manager's office-wide list", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const { cras } = response.json<{ cras: { consultantId: string; consultantName: string }[] }>();

    expect(cras).toContainEqual(
      expect.objectContaining({ consultantId: ALICE, consultantName: 'Alice Martin' }),
    );
    expect(cras).toContainEqual(
      expect.objectContaining({ consultantId: CHLOE, consultantName: 'Chloé Dubois' }),
    );
  });
});

describe('GET /api/v1/cras — consultantIds/statuses (item 7, QA round 1)', () => {
  it('narrows to the given consultants, comma-separated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cras?consultantIds=${ALICE}`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const { cras } = response.json<{ cras: { consultantId: string }[] }>();
    expect(cras.map((cra) => cra.consultantId)).toStrictEqual([ALICE]);
  });

  it('narrows to the given statuses, comma-separated — both filters are ANDed, each an OR within itself', async () => {
    // Everything the fixture seeds is 'submitted' — 'draft' answers empty, and both statuses
    // together answer everything, which is what proves the list is filtered by the value and not
    // just by "a statuses param was present at all".
    const draftOnly = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?statuses=draft',
      headers: as('manager-paris'),
    });
    expect(draftOnly.statusCode).toBe(200);
    expect(draftOnly.json<{ cras: unknown[] }>().cras).toStrictEqual([]);

    const submittedOrDraft = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?statuses=submitted,draft',
      headers: as('manager-paris'),
    });
    expect(submittedOrDraft.statusCode).toBe(200);
    const { cras } = submittedOrDraft.json<{ cras: { consultantId: string }[] }>();
    expect(cras.map((cra) => cra.consultantId).sort()).toStrictEqual([ALICE, CHLOE].sort());
  });

  it('refuses an unknown status rather than silently ignoring it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?statuses=bogus',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(400);
  });

  it('a consultant id outside the actor’s own scope narrows to nothing, never to that id’s office', async () => {
    // manager-lyon may see nothing this fixture seeds (both Cras are Paris) — asking it for a
    // real, but out-of-office, consultant id must still answer empty, not Alice's row: the
    // office boundary runs first and consultantIds only narrows further, never around it.
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cras?consultantIds=${ALICE}`,
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ cras: unknown[] }>().cras).toStrictEqual([]);
  });
});

describe('GET /api/v1/cras — year/month (item 4, QA round 2)', () => {
  // Both fixture rows (`CRA`, `CRA_TWO`) sit at '2026-06' — the same "one real value proves the
  // positive case, a nearby wrong one proves the filter actually reads the value" shape the
  // statuses tests above use.
  it('narrows to the given year, independent of month', async () => {
    const matching = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?year=2026',
      headers: as('manager-paris'),
    });
    expect(matching.statusCode).toBe(200);
    expect(
      matching.json<{ cras: { consultantId: string }[] }>().cras.map((cra) => cra.consultantId),
    ).toStrictEqual(expect.arrayContaining([ALICE, CHLOE]));

    const wrongYear = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?year=2025',
      headers: as('manager-paris'),
    });
    expect(wrongYear.statusCode).toBe(200);
    expect(wrongYear.json<{ cras: unknown[] }>().cras).toStrictEqual([]);
  });

  it('narrows to the given month, independent of year', async () => {
    const matching = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?month=6',
      headers: as('manager-paris'),
    });
    expect(matching.statusCode).toBe(200);
    expect(
      matching.json<{ cras: { consultantId: string }[] }>().cras.map((cra) => cra.consultantId),
    ).toStrictEqual(expect.arrayContaining([ALICE, CHLOE]));

    const wrongMonth = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?month=7',
      headers: as('manager-paris'),
    });
    expect(wrongMonth.statusCode).toBe(200);
    expect(wrongMonth.json<{ cras: unknown[] }>().cras).toStrictEqual([]);
  });

  it('ANDs year and month together, same as any other two filters', async () => {
    const both = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?year=2026&month=6',
      headers: as('manager-paris'),
    });
    expect(both.statusCode).toBe(200);
    expect(
      both.json<{ cras: { consultantId: string }[] }>().cras.map((cra) => cra.consultantId),
    ).toStrictEqual(expect.arrayContaining([ALICE, CHLOE]));

    const rightYearWrongMonth = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?year=2026&month=7',
      headers: as('manager-paris'),
    });
    expect(rightYearWrongMonth.statusCode).toBe(200);
    expect(rightYearWrongMonth.json<{ cras: unknown[] }>().cras).toStrictEqual([]);
  });

  it('refuses a month outside 1-12 rather than silently ignoring it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?month=13',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(400);
  });
});

/**
 * Item 22, QA round 3. The dashboard's "CRA en retard" card deep-links to this list, and the two
 * have to agree — a card reading 2 over a list showing 1 is the failure the item was raised for.
 * `lateCras` is "not validated **and** the period has closed"; the list had no way to express the
 * second half until `beforePeriod`, so the equivalence is asserted here rather than assumed.
 *
 * The fixture's own two Cras are both 2026-06 and both `submitted`, against a clock at
 * 2026-07-02 — so June is closed, both are late, and one extra 2026-05 row below is what makes
 * "strictly before" distinguishable from "the same month".
 */
describe('GET /api/v1/cras — beforePeriod (item 22, QA round 3)', () => {
  const CRA_MAY = 'api-cra-may';

  async function seedMay(): Promise<void> {
    await transaction.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ($1, $2, $3, '2026-05', 'draft')`,
      [CRA_MAY, ALICE, PARIS],
    );
  }

  /**
   * Returns the periods **and** the pagination total, because they come from two different SQL
   * statements — `PgCraRepository.list` and `.count`, each with its own `beforePeriod` clause.
   * Reading only `cras` would leave `count`'s clause deletable with the suite still green, and the
   * footer would then read "3 CRA" over a list showing one: item 22's own defect, one level down
   * inside item 22's fix.
   */
  async function before(bound: string): Promise<{ periods: string[]; total: number }> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cras?beforePeriod=${bound}`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ cras: { period: string }[]; total: number }>();

    return { periods: body.cras.map((cra) => cra.period).sort(), total: body.total };
  }

  it('is strictly before: the bound month itself is excluded, the one before it is not', async () => {
    await seedMay();

    expect(await before('2026-06')).toStrictEqual({ periods: ['2026-05'], total: 1 });
    expect(await before('2026-07')).toStrictEqual({
      periods: ['2026-05', '2026-06', '2026-06'],
      total: 3,
    });
    expect(await before('2026-05')).toStrictEqual({ periods: [], total: 0 });
  });

  it('crosses a year boundary on the text order, not on the digits of the month', async () => {
    // '2025-12' < '2026-01' lexically as well as chronologically, which is the whole reason the
    // column can be compared as text. A month-only comparison would put December after January.
    await transaction.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ('api-cra-dec', $1, $2, '2025-12', 'draft')`,
      [ALICE, PARIS],
    );

    expect(await before('2026-01')).toStrictEqual({ periods: ['2025-12'], total: 1 });
  });

  it('is ANDed with statuses, like every other filter here', async () => {
    await seedMay();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?beforePeriod=2026-07&statuses=draft',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ cras: { id: string }[] }>().cras.map((cra) => cra.id)).toStrictEqual([
      CRA_MAY,
    ]);
  });

  it('answers exactly what the dashboard card counts as late', async () => {
    await seedMay();

    const dashboard = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard?period=2026-06',
      headers: as('manager-paris'),
    });
    expect(dashboard.statusCode).toBe(200);
    const { lateCras } = dashboard.json<{ lateCras: number }>();

    // The card's own link, verbatim: every not-yet-validated status, every period before the
    // current one (2026-07 by this test's clock).
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/cras?statuses=draft,submitted,refused&beforePeriod=2026-07',
      headers: as('manager-paris'),
    });
    expect(listed.statusCode).toBe(200);

    const body = listed.json<{ cras: unknown[]; total: number }>();
    expect(lateCras).toBe(3);
    expect(body.cras).toHaveLength(lateCras);
    // And the footer the list renders under itself, which `count` answers separately.
    expect(body.total).toBe(lateCras);
  });

  it('refuses a malformed bound rather than silently ignoring it', async () => {
    for (const bound of ['2026-13', '2026', '2026-6', 'juin']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/cras?beforePeriod=${bound}`,
        headers: as('manager-paris'),
      });

      expect(response.statusCode, bound).toBe(400);
    }
  });
});

describe('GET /api/v1/consultants (item 7, QA round 1)', () => {
  it("answers the manager's own office roster, consultants only", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consultants',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const { consultants } = response.json<{ consultants: { id: string; displayName: string }[] }>();
    expect(consultants.map((consultant) => consultant.id).sort()).toStrictEqual(
      [ALICE, CHLOE].sort(),
    );
    // Bruno (the manager asking) is a row in `public.consultants` too — never listed among the
    // people *this* filter can pick, which is the point of `role = 'consultant'` in the query.
    expect(consultants.map((consultant) => consultant.id)).not.toContain(BRUNO);
  });

  it('drops a departed consultant from the office roster (ADR-0079)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consultants',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    const { consultants } = response.json<{ consultants: { id: string; displayName: string }[] }>();
    // DEPARTED is the same office, the same role, and would otherwise sort into this list — the
    // one thing that keeps them out is `departure_date IS NULL` in `consultantsOfOffice`.
    expect(consultants.map((consultant) => consultant.id)).not.toContain(DEPARTED);
  });

  it('never crosses the office boundary, even when the other office has nobody to hide', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consultants',
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ consultants: unknown[] }>().consultants).toStrictEqual([]);
  });

  it('refuses a consultant persona — this filter is manager-only', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consultants',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
  });

  it('refuses a billing persona too: no screen renders this filter for that role yet', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/consultants',
      headers: as('billing-paris'),
    });

    expect(response.statusCode).toBe(403);
  });
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
});

describe('the refusal, through the API', () => {
  it("sends a submitted month back, with the manager's reason", async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('manager-paris'),
      payload: { reason: 'jours incomplets' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ craId: CRA, status: 'refused' });

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/cras/${CRA}`,
      headers: as('manager-paris'),
    });
    expect(read.json<{ status: string }>().status).toBe('refused');
  });

  it('refuses a consultant the refusal route on its role alone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('consultant-paris'),
      payload: { reason: 'jours incomplets' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it('refuses billing the refusal route on its role alone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('billing-paris'),
      payload: { reason: 'jours incomplets' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ type: '/problems/insufficient-role' });
  });

  it("refuses a manager of another office, naming the rule (ADR-0003's second beat)", async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('manager-lyon'),
      payload: { reason: 'jours incomplets' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      type: '/problems/out-of-scope',
      deniedBy: '/problems/out-of-scope',
    });
  });

  it('refuses a body with no reason, before the domain is reached', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('manager-paris'),
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a reason that is longer than the bound the domain accepts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('manager-paris'),
      payload: { reason: 'x'.repeat(501) },
    });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a reason that is only whitespace, as the typed domain error it is', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('manager-paris'),
      payload: { reason: '   ' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ type: '/problems/refusal-reason-required' });
  });

  it('refuses a Cra that is not in the submitted state', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('manager-paris'),
      payload: { reason: 'jours incomplets' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/cras/${CRA}/refusal`,
      headers: writingAs('manager-paris'),
      payload: { reason: 'encore' },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ type: '/problems/cra-transition-not-allowed' });
  });

  it('answers 404 for a Cra that does not exist at all', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/cras/api-does-not-exist/refusal',
      headers: writingAs('manager-paris'),
      payload: { reason: 'jours incomplets' },
    });

    expect(response.statusCode).toBe(404);
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

  it('answers a month the consultant has no Cra for with an absence, not a refusal', async () => {
    // Coverage moved here from the now-deleted `/marge` screen's own test (front-end plan
    // Phase 9.3/9.4): the same route, the same fact — a month nobody ever recorded is a 404
    // naming the record, not a 403 naming a rule nobody broke.
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/consultants/${ALICE}/economics?period=2026-05`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ type: '/problems/not-found' });
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
  // 200, not 50: ADR-0081 (item 6/step 3, QA round 1) gave `GET /api/v1/cras` its own cap, past
  // `MAX_PAGE_SIZE` (still 50, and still what `/api/v1/invoices` and every other list here share)
  // — raised once the seed's roster expansion measured a real office clearing fifty Cras (Paris,
  // 65, `docs/adr/0080-…`).
  it('refuses a page size past this route’s own cap rather than silently narrowing it', async () => {
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
      url: '/api/v1/cras?limit=200',
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
  });

  // The regression item 6/step 3 exists to close: before ADR-0081, an office whose Cra count
  // passed the *old* 50-row default answered this route wrong (silently truncated), not thin. 65
  // rows — the exact worst case the roster expansion measured for Paris — asked for at the old
  // default and answered in full, unfiltered.
  it('a manager with more than the old 50-row cap’s worth of Cras sees every one of them, unfiltered', async () => {
    const { client } = transaction;
    const rowCount = 65;
    await client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       SELECT 'api-bulk-cra-' || g, $1, $2,
              to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'draft'
       FROM generate_series(1, $3::int) AS g`,
      [ALICE, PARIS, rowCount],
    );

    const response = await app.inject({
      method: 'GET',
      // The default limit (20) would truncate too — this asks for what the office actually has,
      // the same shape a client sized against a real count (rather than a guess) would send.
      url: `/api/v1/cras?limit=${String(rowCount + 2)}`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    // +2 from `beforeEach`'s own two seeded June Cras (Alice's and Chloé's), both Paris too.
    expect(response.json<{ cras: unknown[] }>().cras).toHaveLength(rowCount + 2);
  });
});

/**
 * The write half of the chain, which did not exist until Phase 6. The open-questions row of
 * 19/08 named the gap precisely: "the consultant persona can therefore see its own month and
 * change nothing about it; the seeded `submitted` Cra exists because the seed wrote it, not
 * because anyone could."
 */
describe('recording a month through the API (ADR-0050)', () => {
  const JULY = workedDaysOfJuly();

  /** One entry per day, each a full day (ADR-0069): one matrix cell per triplet (ADR-0070). */
  function entries(
    mission = MISSION,
  ): { day: string; dayType: 'worked'; missionId: string; quarterDays: number }[] {
    return JULY.map((day) => ({
      day,
      dayType: 'worked' as const,
      missionId: mission,
      quarterDays: 4,
    }));
  }

  it('replaces the month and reports the status it left it in', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('consultant-paris'),
      payload: { submit: false, entries: entries() },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe('draft');
  });

  it('is the same operation the screen performs, so sending it twice leaves one month', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await app.inject({
        method: 'PUT',
        url: '/api/v1/cras/2026-07/entries',
        headers: writingAs('consultant-paris'),
        payload: { submit: false, entries: entries() },
      });
    }

    const { rows } = await transaction.client.query<{ count: string }>(
      `SELECT count(*) FROM timesheet.cras WHERE consultant_id = $1 AND period = '2026-07'`,
      [ALICE],
    );

    expect(rows[0]?.count).toBe('1');
  });

  it('names the period and never a consultant: there is no other month to reach', async () => {
    // The path carries `2026-07` and nothing else. `?consultantId=` and a body field are both
    // ignored, because neither is read — the actor is the consultant, always.
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/cras/2026-07/entries?consultantId=${CHLOE}`,
      headers: writingAs('consultant-paris'),
      payload: { submit: false, entries: entries(), consultantId: CHLOE },
    });

    expect(response.statusCode).toBe(200);

    const { rows } = await transaction.client.query(
      `SELECT 1 FROM timesheet.cras WHERE consultant_id = $1 AND period = '2026-07'`,
      [CHLOE],
    );

    expect(rows).toHaveLength(0);
  });

  it('does not carry the action for a manager', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('manager-paris'),
      payload: { submit: false, entries: [] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ deniedBy: '/problems/insufficient-role' });
  });

  it('refuses a body longer than a month can be', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('consultant-paris'),
      payload: {
        submit: false,
        // 124 is 4 × 31, the longest month at its maximum density (ADR-0069): one entry per
        // quarter-day cell. 125 is one more than the cap however the body is spelled.
        entries: Array.from({ length: 125 }, () => ({
          day: '2026-07-01',
          dayType: 'worked',
          missionId: MISSION,
          quarterDays: 1,
        })),
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('sums two entries for the same day, type and mission into one line, not two', async () => {
    // ADR-0069/0070: a quantity now lives on the entry, so two entries for the same
    // (day, dayType, missionId) triplet are not a normal write — the matrix has exactly one cell
    // for it. They sum into one line rather than producing two, which is the lossy round trip
    // ADR-0066 existed to prevent, reappeared one layer down had this gone unhandled.
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('consultant-paris'),
      payload: {
        submit: false,
        entries: [
          { day: '2026-07-01', dayType: 'worked', missionId: MISSION, quarterDays: 1 },
          { day: '2026-07-01', dayType: 'worked', missionId: MISSION, quarterDays: 3 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const { craId } = response.json<{ craId: string }>();

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/cras/${craId}`,
      headers: as('consultant-paris'),
    });

    expect(
      found.json<{
        lines: { day: string; dayType: string; missionId: string; quarterDays: number }[];
      }>().lines,
    ).toStrictEqual([{ day: '2026-07-01', dayType: 'worked', missionId: MISSION, quarterDays: 4 }]);
  });

  it('submits the month, and the flags come back with it', async () => {
    const saturday = '2026-07-04';
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('consultant-paris'),
      payload: {
        submit: true,
        entries: [
          ...entries(),
          { day: saturday, dayType: 'worked', missionId: MISSION, quarterDays: 4 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe('submitted');
    expect(response.json<{ flags: { day: string }[] }>().flags).toStrictEqual([
      { day: saturday, reason: 'weekend' },
    ]);
  });

  it('refuses an incomplete month with the invariant that refused it', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('consultant-paris'),
      payload: {
        submit: true,
        entries: [{ day: '2026-07-01', dayType: 'worked', missionId: MISSION, quarterDays: 4 }],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ invariant: '/problems/cra-incomplete' });
  });
});

describe('the edges of the write route', () => {
  it('refuses a month whose year the working calendar does not cover', async () => {
    // The holiday table is dated (ADR-0004) and holds 2026 alone. 2030 is a perfectly good
    // `Period` — the value object's own floor is the year 2000, and `1999-01` is refused one layer
    // earlier as `/problems/invalid-value` — so this is the case that reaches the calendar. Refused
    // before anything is written, and not only at submission: a month the firm has no calendar for
    // is a month no rule can judge, so a draft in it would be a row nothing could ever validate.
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2030-01/entries',
      headers: writingAs('consultant-paris'),
      payload: { submit: false, entries: [] },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ type: '/problems/unknown-calendar-year' });
  });

  it('refuses a replay of a submission, which is the one body PUT is not idempotent for', async () => {
    const july = workedDaysOfJuly().map((day) => ({
      day,
      dayType: 'worked' as const,
      missionId: MISSION,
      quarterDays: 4,
    }));

    const first = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('consultant-paris'),
      payload: { submit: true, entries: july },
    });
    expect(first.statusCode).toBe(200);

    // ADR-0050 says a repeated body leaves the same month. That holds while the month is a draft
    // and stops holding the moment it is submitted, because ADR-0005 takes the Cra out of the
    // consultant's hands — the ADR says so rather than claiming an idempotency it does not have.
    const again = await app.inject({
      method: 'PUT',
      url: '/api/v1/cras/2026-07/entries',
      headers: writingAs('consultant-paris'),
      payload: { submit: true, entries: july },
    });

    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ invariant: '/problems/cra-transition-not-allowed' });
  });
});
