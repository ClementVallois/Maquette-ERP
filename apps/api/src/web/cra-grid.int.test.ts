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

import { PATHS } from './paths.ts';

/**
 * The write path behind the entry grid, against a real Postgres — `POST` at
 * `PATHS.consultantCra`, the one registration front-end plan Phase 9.3 kept (the two GET screens
 * that used to render here, the list and the grid, are gone: `apps/web`'s SPA renders `/cra` and
 * `/cra/$period` instead, and `e2e/axe.spec.ts`/`journeys.spec.ts` cover those).
 *
 * What stays here is what Phase 9.4's checkpoint verified is **not** redundant with
 * `apps/api/src/routes/api.int.test.ts`'s "recording a month through the API" section: the
 * SSR-form-specific translation from `day:slot` field names into quarter-day entries
 * (`entriesOf`/`SLOT_FIELD` in `routes.ts`), which the JSON API never has to do because it takes
 * structured entries directly, and the domain behaviour with no JSON-side test at all (splitting
 * one day across two missions, replacing rather than merging a month, and the Habilitation
 * refusal surfacing through *this* route specifically — `api.int.test.ts` covers the same domain
 * rule through `PUT /api/v1/cras/:period/entries`, but nothing there proves it also holds through
 * this form-encoded route). Everything genuinely redundant (summing two slots into one line,
 * flagging a worked Saturday, refusing an incomplete month, the read-only/transition refusal) was
 * removed: `api.int.test.ts`'s own tests of the same names cover it, word for word.
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

describe('saving a month', () => {
  it('records it, redirects to the SPA grid, and does not repost on a refresh', async () => {
    const saved = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('save'),
    });

    // `PATHS.spaCra`, not `PATHS.consultantCra`: since Phase 9.3 the grid a browser lands on
    // after this redirect is the SPA's `/cra/$period` — `shell.test.ts`'s own dedicated
    // assertion covers the chrome's link, this covers the write route's own redirect.
    expect(saved.statusCode).toBe(303);
    expect(saved.headers.location).toBe(`${PATHS.spaCra}/2026-06`);
  });

  it('is not reachable by a manager: the role does not carry the action', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('manager-paris'),
      payload: fullMonthBody('save'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('/problems/insufficient-role');
  });

  it('keeps a day split across two missions as two lines of two quarter-days', async () => {
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

    const { rows } = await transaction.client.query<{ mission_id: string; quarter_days: number }>(
      `SELECT mission_id, quarter_days FROM timesheet.cra_lines ${OF_ALICE}
         AND day = '2026-06-01' ORDER BY mission_id`,
      [ALICE],
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.quarter_days === 2)).toBe(true);
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
  it('refuses a mission whose Habilitation the consultant does not hold (ADR-0051)', async () => {
    // Not redundant with `api.int.test.ts`'s own `PUT /api/v1/cras/:period/entries` coverage,
    // which never posts a habilitation-violating submission at all — this is the one HTTP-route
    // integration test of the refusal anywhere in the repo (the domain rule itself is unit-tested
    // in `packages/timesheet/src/domain/submission-checks.test.ts`, which proves the rule but not
    // that a route wires it through).
    const response = await app.inject({
      method: 'POST',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: posting('consultant-paris'),
      payload: fullMonthBody('submit', MISSION_QUALIFIED),
    });

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('/problems/missing-habilitation');
  });
});
