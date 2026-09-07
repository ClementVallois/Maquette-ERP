import { closePool, getPool } from '@erp/test-harness';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ApiConfig } from '../config.ts';
import { uuidv7 } from '../ids/uuidv7.ts';
import { pgTransactionally } from '../persistence/unit-of-work.ts';
import type { Persona } from '../personas/catalogue.ts';
import { PERSONA_COOKIE, signPersonaKey } from '../personas/cookie.ts';
import { inMemoryPersonas } from '../personas/testing/catalogue.ts';
import { buildServer } from '../server.ts';

/**
 * `api.int.test.ts`'s validate/refuse/record-month tests run over `savepointTransactionally`,
 * proving each single-connection outcome. ADR-0103 closes a race between **two** connections, and
 * a savepoint on one client cannot demonstrate that — the same reason `issuance-concurrency.int.test.ts`
 * (ADR-0102) builds the real server over the real pool instead. Every row here is committed for
 * real and cleaned up by hand; there is no wrapping transaction.
 */

const ORIGIN = 'http://localhost:3000';
const SECRET = 'k'.repeat(40);
const OFFICE = 'cra-concurrency-office';
const PRACTICE = 'cra-concurrency-practice';
const CONSULTANT = 'cra-concurrency-consultant';
const MANAGER = 'cra-concurrency-manager';
const CLIENT = 'cra-concurrency-client';
const MISSION = 'cra-concurrency-mission';
/**
 * `PgReferenceReader.seller()` reads `SELECT * FROM public.legal_entities ORDER BY id LIMIT 1` —
 * unscoped, because this mockup has exactly one seller in a seeded database. Against the real pool
 * with no seed, another integration test file's own temporary row (`issuance-concurrency.int.test.ts`'s
 * `concurrency-entity-*`, or `pg-numbering-counter.int.test.ts`'s permanent `entity-fr`) could be
 * alive at the same instant if Vitest runs files in parallel. `aaa-` sorts before both, so this row
 * — inserted once, never deleted, the same permanent-fixture shape `entity-fr` already established
 * — is the one `seller()` picks whenever it is present, deterministically, regardless of timing.
 */
const SELLER = 'aaa-cra-concurrency-entity';

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
    key: 'consultant',
    role: 'consultant',
    consultantId: CONSULTANT,
    officeId: OFFICE,
    officeName: 'CraConcurrency',
    displayName: 'Consultant',
  },
  {
    key: 'manager',
    role: 'manager',
    consultantId: MANAGER,
    officeId: OFFICE,
    officeName: 'CraConcurrency',
    displayName: 'Manager',
  },
];

function writingAs(key: string): { cookie: string; origin: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}`, origin: ORIGIN };
}

const app: FastifyInstance = buildServer({
  config,
  clock: { now: () => new Date('2026-07-02T09:00:00.000Z') },
  probeDatabase: () => Promise.resolve(),
  personas: inMemoryPersonas(personas),
  transactionally: pgTransactionally(getPool(), uuidv7),
  newId: uuidv7,
});

let craIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (craIds.length > 0) {
    const { rows: invoiceRows } = await pool.query<{ id: string }>(
      `SELECT id FROM billing.invoices WHERE source_cra_ids && $1::text[]`,
      [craIds],
    );
    const invoiceIds = invoiceRows.map((row) => row.id);
    if (invoiceIds.length > 0) {
      await pool.query(`DELETE FROM billing.invoice_vat_groups WHERE invoice_id = ANY($1)`, [
        invoiceIds,
      ]);
      await pool.query(`DELETE FROM billing.invoice_lines WHERE invoice_id = ANY($1)`, [
        invoiceIds,
      ]);
      await pool.query(`DELETE FROM billing.invoices WHERE id = ANY($1)`, [invoiceIds]);
    }
    await pool.query(`DELETE FROM billing.declined_days WHERE cra_id = ANY($1)`, [craIds]);
    await pool.query(`DELETE FROM public.domain_events WHERE payload->>'craId' = ANY($1::text[])`, [
      craIds,
    ]);
    await pool.query(`DELETE FROM timesheet.cra_lines WHERE cra_id = ANY($1)`, [craIds]);
    await pool.query(`DELETE FROM timesheet.cra_flags WHERE cra_id = ANY($1)`, [craIds]);
    await pool.query(`DELETE FROM timesheet.cras WHERE id = ANY($1)`, [craIds]);
  }
  craIds = [];
});

afterAll(async () => {
  const pool = getPool();
  await pool.query(`DELETE FROM public.manager_attachments WHERE consultant_id = $1`, [CONSULTANT]);
  await pool.query(`DELETE FROM public.mission_tjm WHERE mission_id = $1`, [MISSION]);
  await pool.query(`DELETE FROM public.missions WHERE id = $1`, [MISSION]);
  await pool.query(`DELETE FROM public.clients WHERE id = $1`, [CLIENT]);
  await pool.query(`DELETE FROM public.consultants WHERE id = ANY($1)`, [[CONSULTANT, MANAGER]]);
  await pool.query(`DELETE FROM public.practices WHERE id = $1`, [PRACTICE]);
  await pool.query(`DELETE FROM public.offices WHERE id = $1`, [OFFICE]);
  await app.close();
  await closePool();
});

async function seedReferenceData(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO public.offices (id, name, city) VALUES ($1, 'CraConcurrency', 'CraConcurrency')
     ON CONFLICT DO NOTHING`,
    [OFFICE],
  );
  await pool.query(
    `INSERT INTO public.practices (id, name) VALUES ($1, 'Audit') ON CONFLICT DO NOTHING`,
    [PRACTICE],
  );
  await pool.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Cra', 'Consultant', 'cra-cc@test.com', $3, $4, 'consultant'),
            ($2, 'Cra', 'Manager', 'cra-cm@test.com', $3, $4, 'manager')
     ON CONFLICT DO NOTHING`,
    [CONSULTANT, MANAGER, OFFICE, PRACTICE],
  );
  await pool.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $2, $3, '2024-01-01', NULL)
     ON CONFLICT DO NOTHING`,
    [uuidv7(), CONSULTANT, MANAGER],
  );
  await pool.query(
    `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
       billing_address_postal_code, billing_address_city, billing_address_country)
     VALUES ($1, 'Cra Concurrency Client', '443061841', 'metropolitanFrance', '1 rue', '75000',
             'Paris', 'France')
     ON CONFLICT DO NOTHING`,
    [CLIENT],
  );
  await pool.query(
    `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
     VALUES ($1, $2, 'Cra Concurrency Mission', 'Regie', '2026-01-01')
     ON CONFLICT DO NOTHING`,
    [MISSION, CLIENT],
  );
  await pool.query(
    `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
     VALUES ($1, $2, '2026-01-01', NULL, 65000)
     ON CONFLICT DO NOTHING`,
    [uuidv7(), MISSION],
  );
  await pool.query(
    `INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
       intra_community_vat_number, rcs_registration, address_street, address_postal_code,
       address_city, address_country, number_prefix)
     VALUES ($1, 'Cra Concurrency SAS', 'SAS', 10000000, '732829320', 'FR27732829320',
             'RCS Test', '1 rue', '75000', 'Paris', 'France', 'CCC')
     ON CONFLICT DO NOTHING`,
    [SELLER],
  );
}

/** A 'submitted' Cra with one worked line, seeded directly — the calendar/habilitation surface
 * `submit()` would otherwise require is not what these tests are about. */
async function seedSubmittedCra(id: string): Promise<void> {
  const pool = getPool();
  craIds.push(id);
  await pool.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-06-30T09:00:00Z')`,
    [id, CONSULTANT, OFFICE],
  );
  await pool.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, '2026-06-02', 'worked', $3, 4)`,
    [uuidv7(), id, MISSION],
  );
}

/** A 'submitted' Cra with no worked line: `draftInvoicesFrom` produces no invoice at all
 * (package 03 / ADR-0104's own reproduction case). */
async function seedSubmittedAbsenceOnlyCra(id: string): Promise<void> {
  const pool = getPool();
  craIds.push(id);
  await pool.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-06-30T09:00:00Z')`,
    [id, CONSULTANT, OFFICE],
  );
  await pool.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, '2026-06-02', 'absence', NULL, 4)`,
    [uuidv7(), id],
  );
}

async function seedDraftCra(id: string): Promise<void> {
  const pool = getPool();
  craIds.push(id);
  await pool.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
     VALUES ($1, $2, $3, '2026-06', 'draft')`,
    [id, CONSULTANT, OFFICE],
  );
}

interface JsonResponse<T> {
  readonly statusCode: number;
  readonly body: T;
}

async function post<T>(
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<JsonResponse<T>> {
  const response = await app.inject({
    method: 'POST',
    url,
    headers,
    ...(payload === undefined ? {} : { payload }),
  });
  return { statusCode: response.statusCode, body: response.json() };
}

async function put<T>(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<JsonResponse<T>> {
  const response = await app.inject({ method: 'PUT', url, headers, payload });
  return { statusCode: response.statusCode, body: response.json() };
}

async function domainEventCount(craId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM public.domain_events WHERE payload->>'craId' = $1`,
    [craId],
  );
  return Number.parseInt(rows[0]!.count, 10);
}

async function craRowCount(): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM timesheet.cras WHERE consultant_id = $1 AND period = '2026-06'`,
    [CONSULTANT],
  );
  return Number.parseInt(rows[0]!.count, 10);
}

interface CraDetail {
  readonly status: string;
  readonly lines: readonly { day: string }[];
}

async function getCra(id: string): Promise<CraDetail> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/cras/${id}`,
    headers: writingAs('manager'),
  });
  return response.json();
}

/** A short delay biasing which of two real HTTP requests reaches its lock first — deterministic
 * enough for CI, while both requests still run on genuinely independent connections. */
async function settle(ms = 75): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Seeded once: `manager_attachments` and `mission_tjm` have no natural unique constraint the
// per-call `ON CONFLICT DO NOTHING` above could target (each row's own `id` is a fresh UUID), so
// calling this from every test would insert a second, overlapping attachment/rate row each time —
// which is exactly what happened here once, surfacing as `OverlappingPeriodsError` on the second
// test rather than on this file's own setup mistake.
beforeAll(seedReferenceData);

// Unlike the three `describe` blocks below, these two `it`s do not start both requests
// simultaneously: `settle()` gives the first a head start long enough that it has normally
// already committed before the second is even sent. They are sequenced, not raced — what they
// prove is that the loser reads the winner's true post-commit state and gets the right typed
// refusal from it, not that the lock itself resolves a genuine simultaneous collision (the
// `Promise.all` blocks below prove that).
describe('validating and refusing a Cra — one request sequenced just after the other (ADR-0103)', () => {
  it('validate first, refuse just after: refuse loses with the immutability refusal, invoices stay drafted', async () => {
    await seedSubmittedCra('cra-cc-vr-1');

    const validated = post<{ replayed: boolean }>(
      '/api/v1/cras/cra-cc-vr-1/validation',
      writingAs('manager'),
    );
    await settle();
    const refused = await post<{ type?: string }>(
      '/api/v1/cras/cra-cc-vr-1/refusal',
      writingAs('manager'),
      { reason: 'trop tard' },
    );
    const validatedResult = await validated;

    expect(validatedResult.statusCode).toBe(200);
    expect(refused.statusCode).toBe(409);
    expect(refused.body.type).toBe('/problems/validated-cra-is-immutable');

    const cra = await getCra('cra-cc-vr-1');
    expect(cra.status).toBe('validated');

    const invoices = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: writingAs('manager'),
    });
    const drafted = invoices
      .json<{ invoices: { id: string }[] }>()
      .invoices.filter((invoice) => invoice.id.length > 0);
    expect(drafted.length).toBeGreaterThan(0);
  });

  it('refuse first, validate just after: validate loses with the transition refusal, no invoice is drafted', async () => {
    await seedSubmittedCra('cra-cc-vr-2');

    const refused = post<{ status: string }>(
      '/api/v1/cras/cra-cc-vr-2/refusal',
      writingAs('manager'),
      { reason: 'trop tard' },
    );
    await settle();
    const validated = await post<{ type?: string }>(
      '/api/v1/cras/cra-cc-vr-2/validation',
      writingAs('manager'),
    );
    const refusedResult = await refused;

    expect(refusedResult.statusCode).toBe(200);
    expect(validated.statusCode).toBe(409);
    expect(validated.body.type).toBe('/problems/cra-transition-not-allowed');

    const cra = await getCra('cra-cc-vr-2');
    expect(cra.status).toBe('refused');

    const pool = getPool();
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM billing.invoices WHERE source_cra_ids && ARRAY[$1]::text[]`,
      ['cra-cc-vr-2'],
    );
    expect(Number.parseInt(rows[0]!.count, 10)).toBe(0);
  });
});

describe('validating a Cra twice — two real connections racing (ADR-0021, ADR-0103)', () => {
  it('exactly one validated outcome, one replay, and one domain_events row', async () => {
    await seedSubmittedCra('cra-cc-vv-1');

    const [first, second] = await Promise.all([
      post<{ replayed: boolean }>('/api/v1/cras/cra-cc-vv-1/validation', writingAs('manager')),
      post<{ replayed: boolean }>('/api/v1/cras/cra-cc-vv-1/validation', writingAs('manager')),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect([first.body.replayed, second.body.replayed].toSorted()).toStrictEqual([false, true]);

    expect(await domainEventCount('cra-cc-vv-1')).toBe(1);
  });

  it('the same, for a Cra whose validation drafts no invoice at all (ADR-0104)', async () => {
    // The replay check reads `cra.status`, not whether `billing` produced a row (ADR-0104): this
    // is the case that check has to get right and `hasCraBeenProcessed` could not — a
    // successful validation with an empty billing outcome, raced against itself.
    await seedSubmittedAbsenceOnlyCra('cra-cc-vv-2');

    const [first, second] = await Promise.all([
      post<{ replayed: boolean }>('/api/v1/cras/cra-cc-vv-2/validation', writingAs('manager')),
      post<{ replayed: boolean }>('/api/v1/cras/cra-cc-vv-2/validation', writingAs('manager')),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect([first.body.replayed, second.body.replayed].toSorted()).toStrictEqual([false, true]);

    expect(await domainEventCount('cra-cc-vv-2')).toBe(1);

    const cra = await getCra('cra-cc-vv-2');
    expect(cra.status).toBe('validated');
  });
});

describe('saving a Cra twice — two real connections racing (ADR-0103)', () => {
  it('the second commit fully replaces the first: never a merge of both drafts', async () => {
    await seedDraftCra('cra-cc-ss-1');

    const [first, second] = await Promise.all([
      put('/api/v1/cras/2026-06/entries', writingAs('consultant'), {
        submit: false,
        entries: [{ day: '2026-06-01', dayType: 'absence', missionId: null, quarterDays: 4 }],
      }),
      put('/api/v1/cras/2026-06/entries', writingAs('consultant'), {
        submit: false,
        entries: [
          { day: '2026-06-02', dayType: 'absence', missionId: null, quarterDays: 4 },
          { day: '2026-06-03', dayType: 'absence', missionId: null, quarterDays: 4 },
        ],
      }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const cra = await getCra('cra-cc-ss-1');
    // Exactly one full month's worth of lines — one request's entries, never their union: 1 line
    // if the one-entry request committed last, 2 if the two-entry request did.
    expect([1, 2]).toContain(cra.lines.length);
  });
});

describe('recording a month for the first time — two real connections racing (ADR-0103)', () => {
  it('creates exactly one Cra, never a duplicate or an unhandled constraint violation', async () => {
    const [first, second] = await Promise.all([
      put<{ craId: string }>('/api/v1/cras/2026-06/entries', writingAs('consultant'), {
        submit: false,
        entries: [{ day: '2026-06-01', dayType: 'absence', missionId: null, quarterDays: 4 }],
      }),
      put<{ craId: string }>('/api/v1/cras/2026-06/entries', writingAs('consultant'), {
        submit: false,
        entries: [{ day: '2026-06-02', dayType: 'absence', missionId: null, quarterDays: 4 }],
      }),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    // The advisory lock's whole point: the second request finds the first's row and edits it,
    // never opening a second one under the same (consultant, period).
    expect(second.body.craId).toBe(first.body.craId);
    craIds.push(first.body.craId);

    expect(await craRowCount()).toBe(1);

    const cra = await getCra(first.body.craId);
    expect(cra.lines.length).toBe(1);
  });
});
