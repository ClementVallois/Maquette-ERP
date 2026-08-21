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
 * The entry grid and the write path behind it, against a real Postgres.
 *
 * BUILD-PLAN's TDD table asks screens for "an integration test asserting the rendered HTML (status,
 * key text, denied reason)" — so these assert the page, not a JSON projection of it. The same
 * transaction, the same repositories and the same domain refusals as `/api/v1`; what differs is the
 * content type.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'k'.repeat(40);

const PARIS = 'web-office-paris';
const ALICE = 'web-alice';
const BRUNO = 'web-bruno';
const MISSION = 'web-mission';
const MISSION_QUALIFIED = 'web-mission-passi';
const CLIENT = 'web-client';
const PASSI = 'web-passi';

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

function posting(key: string): Record<string, string> {
  return { ...as(key), origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' };
}

/** Every workable day of June 2026: weekdays, minus nothing — the month has no public holiday. */
function workableDaysOfJune(): string[] {
  const days: string[] = [];
  for (let day = 1; day <= 30; day += 1) {
    const iso = `2026-06-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(iso);
  }

  return days;
}

/** The whole month worked on one mission, as the grid would post it. */
function fullMonthBody(action: 'save' | 'submit', mission = MISSION): string {
  const fields = workableDaysOfJune().flatMap((day) => [
    `${encodeURIComponent(`${day}:0`)}=${mission}`,
    `${encodeURIComponent(`${day}:1`)}=${mission}`,
  ]);

  return [...fields, `action=${action}`].join('&');
}

/**
 * The integration database is **seeded**, and the per-test transaction rolls back only what this
 * test wrote — it does not hide what was committed before it. So every assertion below narrows to
 * the Cra this file created; a bare `SELECT … FROM timesheet.cra_lines` counts the seed's month
 * too, and passes or fails for reasons that have nothing to do with the test.
 */
const OF_ALICE = `WHERE cra_id IN (SELECT id FROM timesheet.cras WHERE consultant_id = $1)`;

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
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('web-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'web-a@t', $3, 'web-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'web-b@t', $3, 'web-practice', 'manager')`,
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
            ($2, $3, 'Audit PASSI', 'Regie', '2026-01-05')`,
    [MISSION, MISSION_QUALIFIED, CLIENT],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $3, $4, '2026-01-05', NULL), ($2, $3, $5, '2026-01-05', NULL)`,
    [uuidv7(), uuidv7(), ALICE, MISSION, MISSION_QUALIFIED],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $2, $3, '2024-01-01', NULL)`,
    [uuidv7(), ALICE, BRUNO],
  );
  // The qualified mission requires PASSI, and Alice does not hold it: the one shape ADR-0051 says
  // the seed can never contain, because a seed that violated the rule would not seed.
  await client.query(`INSERT INTO public.habilitations (id, name) VALUES ($1, 'PASSI')`, [PASSI]);
  await client.query(
    `INSERT INTO public.mission_habilitations (id, mission_id, habilitation_id)
     VALUES ($1, $2, $3)`,
    [uuidv7(), MISSION_QUALIFIED, PASSI],
  );
});

afterEach(async () => {
  await app.close();
});

describe('the grid renders the month', () => {
  it('offers a slot for every day of June, workable or not', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    // The 6th is a Saturday, and it has a slot: a weekend worked is the manager's to accept, so
    // the grid has to let it be entered before the flag can exist.
    expect(response.body).toContain('name="2026-06-06:0"');
    expect(response.body).toContain('name="2026-06-30:1"');
  });

  it('says the month has not been started, rather than rendering an empty table silently', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: as('consultant-paris'),
    });

    expect(response.body).toContain(LABELS.cra.notStartedYet);
  });

  it('offers only the missions this consultant is staffed on', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: as('consultant-paris'),
    });

    expect(response.body).toContain(`value="${MISSION}"`);
    expect(response.body).toContain(`value="${MISSION_QUALIFIED}"`);
  });

  it('is not reachable by a manager: the role does not carry the action', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('/problems/insufficient-role');
  });
});

describe('saving a month', () => {
  it('records it and comes back to the grid, so a refresh does not repost', async () => {
    const saved = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('save'),
    });

    expect(saved.statusCode).toBe(303);
    expect(saved.headers.location).toBe(`${PATHS.consultantCra}/2026-06`);

    const grid = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: as('consultant-paris'),
    });

    expect(grid.body).toContain(LABELS.cra.totals);
    expect(grid.body).not.toContain(LABELS.cra.notStartedYet);
  });

  it('folds two half-days on one mission into one line of two half-days', async () => {
    await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('save'),
    });

    const { rows } = await transaction.client.query<{ half_days: number; count: string }>(
      `SELECT half_days, count(*) FROM timesheet.cra_lines ${OF_ALICE} GROUP BY half_days`,
      [ALICE],
    );

    expect(rows).toStrictEqual([{ half_days: 2, count: String(workableDaysOfJune().length) }]);
  });

  it('keeps a day split across two missions as two lines of one half-day', async () => {
    const split = workableDaysOfJune()
      .flatMap((day, index) =>
        index === 0
          ? [
              `${encodeURIComponent(`${day}:0`)}=${MISSION}`,
              `${encodeURIComponent(`${day}:1`)}=${MISSION_QUALIFIED}`,
            ]
          : [
              `${encodeURIComponent(`${day}:0`)}=${MISSION}`,
              `${encodeURIComponent(`${day}:1`)}=${MISSION}`,
            ],
      )
      .join('&');

    await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: `${split}&action=save`,
    });

    const { rows } = await transaction.client.query<{ mission_id: string; half_days: number }>(
      `SELECT mission_id, half_days FROM timesheet.cra_lines ${OF_ALICE}
         AND day = '2026-06-01' ORDER BY mission_id`,
      [ALICE],
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.half_days === 1)).toBe(true);
  });

  it('replaces the month rather than merging into it', async () => {
    await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('save'),
    });

    // A second save with one day emptied. A merge would leave that day recorded, and the
    // consultant would have no way to take a day back.
    const withoutFirstDay = workableDaysOfJune()
      .slice(1)
      .flatMap((day) => [
        `${encodeURIComponent(`${day}:0`)}=${MISSION}`,
        `${encodeURIComponent(`${day}:1`)}=${MISSION}`,
      ])
      .join('&');

    await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: `${withoutFirstDay}&action=save`,
    });

    const { rows } = await transaction.client.query(
      `SELECT 1 FROM timesheet.cra_lines ${OF_ALICE} AND day = '2026-06-01'`,
      [ALICE],
    );

    expect(rows).toHaveLength(0);
  });

  it('ignores a field that is not a slot, rather than interpreting it', async () => {
    const saved = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: `${fullMonthBody('save')}&__proto__=x&pas-une-date=${MISSION}&2026-06-01:9=${MISSION}`,
    });

    expect(saved.statusCode).toBe(303);
  });
});

describe('submitting a month', () => {
  it('flags a Saturday that was worked, without refusing it', async () => {
    const withSaturday = `${fullMonthBody('submit')}&${encodeURIComponent('2026-06-06:0')}=${MISSION}&${encodeURIComponent('2026-06-06:1')}=${MISSION}`;

    const submitted = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: withSaturday,
    });

    expect(submitted.statusCode).toBe(303);

    const { rows } = await transaction.client.query<{ day: string; reason: string }>(
      `SELECT day, reason FROM timesheet.cra_flags
         WHERE cra_id IN (SELECT id FROM timesheet.cras WHERE consultant_id = $1)`,
      [ALICE],
    );

    expect(rows).toStrictEqual([{ day: '2026-06-06', reason: 'weekend' }]);
  });

  it('refuses an incomplete month, and the page names the invariant', async () => {
    const oneDay = `${encodeURIComponent('2026-06-01:0')}=${MISSION}&${encodeURIComponent('2026-06-01:1')}=${MISSION}&action=submit`;

    const response = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: oneDay,
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('/problems/cra-incomplete');
  });

  it('refuses a mission whose Habilitation the consultant does not hold (ADR-0051)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('submit', MISSION_QUALIFIED),
    });

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('/problems/missing-habilitation');
  });

  it('makes the grid read-only once submitted, and says why', async () => {
    await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('submit'),
    });

    const grid = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: as('consultant-paris'),
    });

    expect(grid.body).toContain(LABELS.cra.readOnly.submitted);
    expect(grid.body).not.toContain('<select');
  });

  it('refuses a further save on a submitted month, from the domain and not from the screen', async () => {
    await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('submit'),
    });

    const again = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('save'),
    });

    expect(again.statusCode).toBe(409);
    expect(again.body).toContain('/problems/cra-transition-not-allowed');
  });
});

describe('the list, and the empty state that is not a refusal', () => {
  it('is empty for a month the consultant simply did not work', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}?periode=2026-07`,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(LABELS.cra.emptyList);
    // The distinction ADR-0003 exists to keep sharp: nothing was refused here, and the page says
    // so. An out-of-scope list is empty too, and that one is an authorization absence.
    expect(response.body).toContain(LABELS.cra.emptyListHint);
    expect(response.body).not.toContain('/problems/out-of-scope');
  });

  it('lists the month once it exists, and links to its grid', async () => {
    await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('save'),
    });

    const response = await app.inject({
      method: 'GET',
      url: PATHS.consultantCra,
      headers: as('consultant-paris'),
    });

    expect(response.body).toContain('juin 2026');
    expect(response.body).toContain(`href="${PATHS.consultantCra}/2026-06"`);
  });

  it('keeps the filter in the URL, so the view is shareable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}?periode=2026-06`,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(200);
  });

  it('refuses a malformed period rather than ignoring it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}?periode=juin`,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain(LABELS.problem.heading.malformed);
  });
});
