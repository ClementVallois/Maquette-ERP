import type { Actor } from '@erp/platform';
import { useTestTransaction } from '@erp/test-harness';
import { describe, expect, it } from 'vitest';

import { uuidv7 } from '../ids/uuidv7.ts';

import { createAssignment, updateAssignment, type AssignmentInput } from './assignment-admin.ts';

/**
 * `validateAssignment` had no direct test anywhere in the repository before this file (package 04
 * of `docs/clean-up-audit.consolidated.local.md`). Two defects were reproduced and are fixed here;
 * every other case in this file is a positive or negative regression test the audit asked for and
 * none of them had before.
 */

const transaction = useTestTransaction();

const PARIS = 'staffing-office-paris';
const CONSULTANT = 'staffing-consultant';
const MISSION_OPEN = 'staffing-mission-open';
const MISSION_FINITE = 'staffing-mission-finite';
const MISSION_QUALIFIED = 'staffing-mission-qualified';
const CLIENT = 'staffing-client';
const HABILITATION = 'staffing-passi';

const manager: Actor = { consultantId: 'staffing-manager', officeId: PARIS, role: 'manager' };

async function seed(consultantDeparture: string | null = null): Promise<void> {
  const { client } = transaction;
  await client.query(`INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris')`, [
    PARIS,
  ]);
  await client.query(
    `INSERT INTO public.practices (id, name) VALUES ('staffing-practice', 'Audit')`,
  );
  await client.query(
    `INSERT INTO public.consultants
       (id, first_name, last_name, email, office_id, practice_id, role, departure_date)
     VALUES ($1, 'Alice', 'Dupont', 'staffing-a@test', $2, 'staffing-practice', 'consultant', $3)`,
    [CONSULTANT, PARIS, consultantDeparture],
  );
  await client.query(
    `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
       billing_address_postal_code, billing_address_city, billing_address_country)
     VALUES ($1, 'Client Test', '443061841', 'metropolitanFrance', '1 rue', '75000', 'Paris', 'France')`,
    [CLIENT],
  );
  await client.query(
    `INSERT INTO public.missions (id, client_id, name, billing_model, start_date, end_date)
     VALUES ($1, $2, 'Mission ouverte', 'Regie', '2026-01-01', NULL),
            ($3, $2, 'Mission finie', 'Regie', '2026-01-01', '2026-08-31'),
            ($4, $2, 'Mission qualifiée', 'Regie', '2026-01-01', NULL)`,
    [MISSION_OPEN, CLIENT, MISSION_FINITE, MISSION_QUALIFIED],
  );
  await client.query(`INSERT INTO public.habilitations (id, name) VALUES ($1, 'PASSI')`, [
    HABILITATION,
  ]);
  await client.query(
    `INSERT INTO public.mission_habilitations (id, mission_id, habilitation_id) VALUES ($1, $2, $3)`,
    [uuidv7(), MISSION_QUALIFIED, HABILITATION],
  );
}

async function heldHabilitation(from: string, to: string | null): Promise<void> {
  await transaction.client.query(
    `INSERT INTO public.consultant_habilitations (id, consultant_id, habilitation_id, obtained_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv7(), CONSULTANT, HABILITATION, from, to],
  );
}

function assignment(overrides: Partial<AssignmentInput> = {}): AssignmentInput {
  return {
    consultantId: CONSULTANT,
    missionId: MISSION_OPEN,
    fromDate: '2026-07-01',
    toDate: null,
    ...overrides,
  };
}

describe('validateAssignment — departure boundaries', () => {
  it('refuses an open-ended assignment starting before a known departure', async () => {
    // Reproduced: departure 2026-07-15, assignment from 2026-07-01 with toDate null — accepted
    // before the fix, because the departure check never considered an unbounded end at all.
    await seed('2026-07-15');

    const outcome = await createAssignment(transaction.client, manager, uuidv7, assignment());

    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') {
      expect(outcome.problemType).toBe('/problems/assignment-after-departure');
    }
  });

  it('refuses a bounded assignment ending on the departure date itself', async () => {
    await seed('2026-07-15');

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-15' }),
    );

    expect(outcome.kind).toBe('refused');
  });

  it('accepts a bounded assignment ending the day before departure', async () => {
    await seed('2026-07-15');

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-14' }),
    );

    expect(outcome.kind).toBe('saved');
  });

  it('accepts an open-ended assignment when the consultant has not departed', async () => {
    await seed(null);

    const outcome = await createAssignment(transaction.client, manager, uuidv7, assignment());

    expect(outcome.kind).toBe('saved');
  });
});

describe('validateAssignment — habilitation coverage over the whole interval', () => {
  it('refuses when the held habilitation has a gap inside the assignment', async () => {
    // Reproduced: held July 1-5 and July 20-31, assignment July 1-31 — accepted before the fix,
    // because only the endpoints (July 1 and July 31) were checked, missing July 6-19.
    await seed(null);
    await heldHabilitation('2026-07-01', '2026-07-05');
    await heldHabilitation('2026-07-20', '2026-07-31');

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({
        missionId: MISSION_QUALIFIED,
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
      }),
    );

    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') {
      expect(outcome.problemType).toBe('/problems/assignment-missing-habilitation');
      expect(outcome.details['habilitations']).toBe('PASSI');
    }
  });

  it('accepts a contiguous renewal with no gap', async () => {
    await seed(null);
    await heldHabilitation('2026-07-01', '2026-07-15');
    await heldHabilitation('2026-07-16', '2026-07-31');

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({
        missionId: MISSION_QUALIFIED,
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
      }),
    );

    expect(outcome.kind).toBe('saved');
  });

  it('accepts when held and assignment share the exact same inclusive boundary', async () => {
    await seed(null);
    await heldHabilitation('2026-07-01', '2026-07-31');

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({
        missionId: MISSION_QUALIFIED,
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
      }),
    );

    expect(outcome.kind).toBe('saved');
  });

  it('refuses when held expires one day before the assignment ends', async () => {
    await seed(null);
    await heldHabilitation('2026-07-01', '2026-07-30');

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({
        missionId: MISSION_QUALIFIED,
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
      }),
    );

    expect(outcome.kind).toBe('refused');
  });

  it('accepts an open-ended assignment covered by an open-ended habilitation', async () => {
    await seed(null);
    await heldHabilitation('2026-01-01', null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ missionId: MISSION_QUALIFIED, fromDate: '2026-07-01', toDate: null }),
    );

    expect(outcome.kind).toBe('saved');
  });

  it('refuses an open-ended assignment when the habilitation expires', async () => {
    await seed(null);
    await heldHabilitation('2026-01-01', '2026-12-31');

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ missionId: MISSION_QUALIFIED, fromDate: '2026-07-01', toDate: null }),
    );

    expect(outcome.kind).toBe('refused');
  });

  it('refuses when no habilitation is held at all', async () => {
    await seed(null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({
        missionId: MISSION_QUALIFIED,
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
      }),
    );

    expect(outcome.kind).toBe('refused');
  });

  it('needs no habilitation on a mission that requires none', async () => {
    await seed(null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ missionId: MISSION_OPEN, fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );

    expect(outcome.kind).toBe('saved');
  });
});

describe('validateAssignment — finite mission ends', () => {
  it('refuses an open-ended assignment on a mission that has an end date', async () => {
    await seed(null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ missionId: MISSION_FINITE, fromDate: '2026-07-01', toDate: null }),
    );

    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') {
      expect(outcome.problemType).toBe('/problems/assignment-outside-mission');
    }
  });

  it('accepts a bounded assignment that ends on the mission’s own end date', async () => {
    await seed(null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ missionId: MISSION_FINITE, fromDate: '2026-07-01', toDate: '2026-08-31' }),
    );

    expect(outcome.kind).toBe('saved');
  });

  it('refuses an assignment that starts after the mission ended', async () => {
    await seed(null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ missionId: MISSION_FINITE, fromDate: '2026-09-01', toDate: '2026-09-30' }),
    );

    expect(outcome.kind).toBe('refused');
  });
});

describe('validateAssignment — overlap and range', () => {
  it('refuses toDate before fromDate', async () => {
    await seed(null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-31', toDate: '2026-07-01' }),
    );

    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') {
      expect(outcome.problemType).toBe('/problems/assignment-invalid-range');
    }
  });

  it('refuses a second assignment overlapping an existing one on the same mission', async () => {
    await seed(null);
    const first = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-15' }),
    );
    expect(first.kind).toBe('saved');

    const second = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-10', toDate: '2026-07-20' }),
    );

    expect(second.kind).toBe('refused');
    if (second.kind === 'refused') {
      expect(second.problemType).toBe('/problems/assignment-overlap');
    }
  });

  it('accepts two disjoint assignments on the same mission', async () => {
    await seed(null);
    const first = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-01-01', toDate: '2026-01-31' }),
    );
    expect(first.kind).toBe('saved');

    const second = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );

    expect(second.kind).toBe('saved');
  });
});

describe('createAssignment and updateAssignment — HTTP-independent behaviour', () => {
  it('returns notFound for a consultant outside the actor’s office', async () => {
    await seed(null);
    const elsewhere: Actor = {
      consultantId: 'x',
      officeId: 'staffing-office-lyon',
      role: 'manager',
    };

    const outcome = await createAssignment(transaction.client, elsewhere, uuidv7, assignment());

    expect(outcome.kind).toBe('notFound');
  });

  it('returns notFound for a mission that does not exist', async () => {
    await seed(null);

    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ missionId: 'staffing-mission-nowhere' }),
    );

    expect(outcome.kind).toBe('notFound');
  });

  it('updates an assignment’s dates within the same interval rules', async () => {
    await seed(null);
    const created = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-15' }),
    );
    expect(created.kind).toBe('saved');
    const id = created.kind === 'saved' ? created.id : '';

    const updated = await updateAssignment(
      transaction.client,
      manager,
      id,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-20' }),
    );

    expect(updated.kind).toBe('saved');
  });

  it('refuses shortening an assignment past a day already recorded on a Cra', async () => {
    await seed(null);
    await transaction.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ($1, $2, $3, '2026-07', 'draft')`,
      [uuidv7(), CONSULTANT, PARIS],
    );
    const { rows } = await transaction.client.query<{ id: string }>(
      `SELECT id FROM timesheet.cras WHERE consultant_id = $1 AND period = '2026-07'`,
      [CONSULTANT],
    );
    await transaction.client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, '2026-07-25', 'worked', $3, 4)`,
      [uuidv7(), rows[0]!.id, MISSION_OPEN],
    );

    const created = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );
    expect(created.kind).toBe('saved');
    const id = created.kind === 'saved' ? created.id : '';

    const updated = await updateAssignment(
      transaction.client,
      manager,
      id,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-20' }),
    );

    expect(updated.kind).toBe('refused');
    if (updated.kind === 'refused') {
      expect(updated.problemType).toBe('/problems/assignment-recorded-days');
    }
  });
});
