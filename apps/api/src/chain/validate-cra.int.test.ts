import { type Actor, OutOfScopeError } from '@erp/platform';
import { useTestTransaction } from '@erp/test-harness';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiFailure } from '../errors.ts';
import { uuidv7 } from '../ids/uuidv7.ts';
import type { Transactionally } from '../persistence/unit-of-work.ts';
import { savepointTransactionally } from '../testing/transaction.ts';

import { validateCraAndDraftInvoices } from './validate-cra.ts';

/**
 * The chain, end to end, against a real Postgres: a submitted Cra is validated and its draft
 * invoices appear — or neither happens.
 *
 * The happy path is the easy half. The half that matters is the failure: a subscriber that throws
 * after drafting must leave the Cra `submitted` and no invoice row behind. Without that test,
 * "commit together or not at all" is a claim about code nobody ran.
 *
 * Isolation note: `savepointTransactionally` is used and a nested `BEGIN` is not. The harness has
 * already opened a transaction on this client; a `BEGIN … COMMIT` inside it would warn, no-op,
 * and then commit the harness's own transaction, after which the per-test rollback undoes nothing
 * and every later test in the run reads leaked rows.
 */

const transaction = useTestTransaction();

const PARIS = 'chain-office-paris';
const CONSULTANT = 'chain-consultant';
const MANAGER = 'chain-manager';
const MISSION = 'chain-mission';
const CLIENT = 'chain-client';
const ENTITY = 'chain-entity';
const CRA = 'chain-cra';

const manager: Actor = { consultantId: MANAGER, officeId: PARIS, role: 'manager' };

const clock = { now: () => new Date('2026-07-02T09:00:00.000Z') };

let transactionally: Transactionally;

/** Every workable day of June 2026 worked on one mission: the shape `submit` requires. */
function workedDaysOfJune(): { day: string; quarterDays: number }[] {
  const days: { day: string; quarterDays: number }[] = [];
  const holidays = new Set(['2026-06-01']);

  for (let day = 1; day <= 30; day++) {
    const iso = `2026-06-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    if (weekday === 0 || weekday === 6 || holidays.has(iso)) continue;
    days.push({ day: iso, quarterDays: 4 });
  }

  return days;
}

beforeEach(async () => {
  const { client } = transaction;
  transactionally = savepointTransactionally(client, uuidv7);

  await client.query(`INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris')`, [
    PARIS,
  ]);
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('chain-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'chain-alice@test', $3, 'chain-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'chain-bruno@test', $3, 'chain-practice', 'manager')`,
    [CONSULTANT, MANAGER, PARIS],
  );
  await client.query(
    `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
       billing_address_postal_code, billing_address_city, billing_address_country)
     VALUES ($1, 'Banque Nationale de Test', '443061841', 'metropolitanFrance',
             '10 avenue', '75008', 'Paris', 'France')`,
    [CLIENT],
  );
  await client.query(
    `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
     VALUES ($1, $2, 'Audit DORA', 'Regie', '2026-01-05')`,
    [MISSION, CLIENT],
  );
  await client.query(
    `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
     VALUES ($1, $2, '2026-01-05', NULL, 85000)`,
    [uuidv7(), MISSION],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $2, $3, '2026-01-05', NULL)`,
    [uuidv7(), CONSULTANT, MISSION],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $2, $3, '2024-01-01', NULL)`,
    [uuidv7(), CONSULTANT, MANAGER],
  );
  await client.query(
    `INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
       intra_community_vat_number, rcs_registration, address_street, address_postal_code,
       address_city, address_country, number_prefix)
     VALUES ($1, 'SecureCo SAS', 'SAS', 10000000, '732829320', 'FR27732829320',
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'SEC')`,
    [ENTITY],
  );

  // A submitted Cra, written straight to the tables — the point of this test is validation, and
  // building it through `submit` here would test the same domain twice.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA, CONSULTANT, PARIS],
  );
  for (const line of workedDaysOfJune()) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, $5)`,
      [uuidv7(), CRA, line.day, MISSION, line.quarterDays],
    );
  }
});

async function statusOfCra(): Promise<string | undefined> {
  const { rows } = await transaction.client.query<{ status: string }>(
    `SELECT status FROM timesheet.cras WHERE id = $1`,
    [CRA],
  );

  return rows[0]?.status;
}

async function invoiceCount(): Promise<number> {
  const { rows } = await transaction.client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM billing.invoices WHERE $1 = ANY(source_cra_ids)`,
    [CRA],
  );

  return Number.parseInt(rows[0]?.count ?? '0', 10);
}

describe('validating a Cra drafts its invoices', () => {
  it('validates, drafts and journals the event in one transaction', async () => {
    const outcome = await validateCraAndDraftInvoices(
      { transactionally, clock, newId: uuidv7 },
      { craId: CRA, actor: manager, correlationId: 'corr-chain-1' },
    );

    expect(outcome.kind).toBe('validated');
    expect(outcome.invoices).toHaveLength(1);
    expect(outcome.invoices[0]!.billedToName).toBe('Banque Nationale de Test');
    expect(outcome.invoices[0]!.status).toBe('draft');
    expect(await statusOfCra()).toBe('validated');

    const { rows: events } = await transaction.client.query<{ type: string }>(
      `SELECT type FROM public.domain_events WHERE correlation_id = $1`,
      ['corr-chain-1'],
    );
    expect(events.map((row) => row.type)).toStrictEqual(['timesheet.TimesheetValidated']);
  });

  it('leaves nothing behind when the subscriber fails after drafting', async () => {
    // The test the guarantee actually rests on. A failure between the draft and the commit must
    // undo the validation too — otherwise a Cra is `validated` with no invoice and no journal
    // entry, which is the discrepancy this whole chain exists to prevent.
    const exploding: Transactionally = async (work) =>
      transactionally(async (unit) => {
        const result = await work({
          ...unit,
          events: {
            persist: () => {
              throw new ApiFailure('the journal write failed');
            },
          },
        });

        return result;
      });

    await expect(
      validateCraAndDraftInvoices(
        { transactionally: exploding, clock, newId: uuidv7 },
        { craId: CRA, actor: manager, correlationId: 'corr-chain-2' },
      ),
    ).rejects.toThrow('the journal write failed');

    expect(await statusOfCra()).toBe('submitted');
    expect(await invoiceCount()).toBe(0);
  });

  it('answers the original documents on a replay, and drafts no second invoice', async () => {
    // ADR-0021's contract, in its own words: replay → original result, not rejection.
    const first = await validateCraAndDraftInvoices(
      { transactionally, clock, newId: uuidv7 },
      { craId: CRA, actor: manager, correlationId: 'corr-chain-3' },
    );

    const replay = await validateCraAndDraftInvoices(
      { transactionally, clock, newId: uuidv7 },
      { craId: CRA, actor: manager, correlationId: 'corr-chain-4' },
    );

    expect(replay.kind).toBe('replayed');
    expect(replay.invoices.map((invoice) => invoice.id)).toStrictEqual(
      first.invoices.map((invoice) => invoice.id),
    );
    expect(await invoiceCount()).toBe(1);
  });

  it('records the days that produced no line, with the reason', async () => {
    // `billing.declined_days` had no writer and no reader until this phase. A Forfait mission is
    // declined as `notRegie` (ADR-0037): the day was worked, it is accounted for, and it bills
    // nothing — which is what the pré-facturier has to be able to say.
    await transaction.client.query(
      `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
       VALUES ('chain-forfait', $1, 'Forfait interne', 'Forfait', '2026-01-05')`,
      [CLIENT],
    );
    await transaction.client.query(
      `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
       VALUES ($1, $2, 'chain-forfait', '2026-01-05', NULL)`,
      [uuidv7(), CONSULTANT],
    );
    await transaction.client.query(
      `UPDATE timesheet.cra_lines SET mission_id = 'chain-forfait' WHERE cra_id = $1 AND day = '2026-06-02'`,
      [CRA],
    );

    const outcome = await validateCraAndDraftInvoices(
      { transactionally, clock, newId: uuidv7 },
      { craId: CRA, actor: manager, correlationId: 'corr-chain-5' },
    );

    expect(outcome.declined).toStrictEqual([
      { craId: CRA, missionId: 'chain-forfait', quarterDays: 4, reason: 'notRegie' },
    ]);
  });

  it('refuses a manager of another office before it reads anything', async () => {
    const elsewhere: Actor = {
      consultantId: 'other',
      officeId: 'chain-office-lyon',
      role: 'manager',
    };

    await expect(
      validateCraAndDraftInvoices(
        { transactionally, clock, newId: uuidv7 },
        { craId: CRA, actor: elsewhere, correlationId: 'corr-chain-6' },
      ),
    ).rejects.toThrow(OutOfScopeError);

    expect(await statusOfCra()).toBe('submitted');
  });

  it('answers notFound for a Cra that does not exist', async () => {
    const outcome = await validateCraAndDraftInvoices(
      { transactionally, clock, newId: uuidv7 },
      { craId: 'chain-nothing', actor: manager, correlationId: 'corr-chain-7' },
    );

    expect(outcome.kind).toBe('notFound');
  });
});
