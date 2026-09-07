import type { AssignmentInput } from '@erp/contracts';
import type { Actor } from '@erp/platform';
import { closePool, getPool, useTestTransaction } from '@erp/test-harness';
import { afterAll, describe, expect, it } from 'vitest';

import { uuidv7 } from '../ids/uuidv7.ts';

import { createAssignment, updateAssignment } from './assignment-admin.ts';

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

/**
 * `status` only changes what the seeded Cra row says about itself — the recorded-days query
 * (package 05, ADR-0106) reads `timesheet.cra_lines` by `consultant_id` alone, with no `status`
 * filter, so a day already recorded on a `submitted` or `validated` Cra is exactly as protected
 * as one on a `draft`. Migration 002 puts no `CHECK` between `status` and
 * `validated_at`/`validated_by`, so a bare `status` value needs no companion columns here.
 */
async function seedCraLine(
  day: string,
  missionId: string,
  status: 'draft' | 'submitted' | 'validated' = 'draft',
): Promise<void> {
  const { client } = transaction;
  const period = day.slice(0, 7);
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [uuidv7(), CONSULTANT, PARIS, period, status],
  );
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM timesheet.cras WHERE consultant_id = $1 AND period = $2`,
    [CONSULTANT, period],
  );
  await client.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, $3, 'worked', $4, 4)`,
    [uuidv7(), rows[0]!.id, day, missionId],
  );
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

  it('refuses an invalid range before looking up the consultant', async () => {
    const outcome = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({
        consultantId: 'missing-consultant',
        fromDate: '2026-07-31',
        toDate: '2026-07-01',
      }),
    );

    expect(outcome).toMatchObject({
      kind: 'refused',
      problemType: '/problems/assignment-invalid-range',
    });
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

describe('updateAssignment — recorded days weighed against every assignment, not just the one edited (package 05)', () => {
  it('does not block editing one assignment over a day a disjoint, untouched assignment still covers', async () => {
    // Reproduced: a January assignment with a recorded day, and an unrelated July assignment on
    // the same mission — before the fix, shrinking July's range refused because the check
    // compared every recorded day for (consultant, mission) only to July's own new range, finding
    // January's day "outside" it. January's own assignment is untouched by this edit and still
    // covers its own recorded day.
    await seed(null);
    const january = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-01-01', toDate: '2026-01-31' }),
    );
    expect(january.kind).toBe('saved');
    await seedCraLine('2026-01-15', MISSION_OPEN);

    const july = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );
    expect(july.kind).toBe('saved');
    const julyId = july.kind === 'saved' ? july.id : '';

    const updated = await updateAssignment(
      transaction.client,
      manager,
      julyId,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-15' }),
    );

    expect(updated.kind).toBe('saved');
  });

  it('still refuses shrinking the only assignment that covers a recorded day', async () => {
    // Regression guard: the fix must not turn into "always accept" — a day with no other
    // covering assignment is still refused.
    await seed(null);
    const only = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );
    expect(only.kind).toBe('saved');
    const id = only.kind === 'saved' ? only.id : '';
    await seedCraLine('2026-07-25', MISSION_OPEN);

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

  it.each(['draft', 'submitted', 'validated'] as const)(
    'refuses the same way whether the recorded day sits on a %s Cra',
    async (status) => {
      // The query filters `timesheet.cra_lines` by `consultant_id` alone — it does not read
      // `status` at all — so this is a uniformity check, not three different behaviours: the
      // audit's "Done when" line names draft/submitted/validated explicitly, and a `validated`
      // day (already invoiced) is the one that matters most to get right.
      await seed(null);
      const only = await createAssignment(
        transaction.client,
        manager,
        uuidv7,
        assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
      );
      expect(only.kind).toBe('saved');
      const id = only.kind === 'saved' ? only.id : '';
      await seedCraLine('2026-07-25', MISSION_OPEN, status);

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
    },
  );

  it('accepts a recorded day exactly on the new inclusive toDate', async () => {
    await seed(null);
    const only = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );
    expect(only.kind).toBe('saved');
    const id = only.kind === 'saved' ? only.id : '';
    await seedCraLine('2026-07-20', MISSION_OPEN);

    const updated = await updateAssignment(
      transaction.client,
      manager,
      id,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-20' }),
    );

    expect(updated.kind).toBe('saved');
  });

  it('refuses a recorded day exactly one day past the new inclusive toDate', async () => {
    await seed(null);
    const only = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );
    expect(only.kind).toBe('saved');
    const id = only.kind === 'saved' ? only.id : '';
    await seedCraLine('2026-07-21', MISSION_OPEN);

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

  it('accepts a recorded day exactly on the new inclusive fromDate', async () => {
    await seed(null);
    const only = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );
    expect(only.kind).toBe('saved');
    const id = only.kind === 'saved' ? only.id : '';
    await seedCraLine('2026-07-10', MISSION_OPEN);

    const updated = await updateAssignment(
      transaction.client,
      manager,
      id,
      assignment({ fromDate: '2026-07-10', toDate: '2026-07-31' }),
    );

    expect(updated.kind).toBe('saved');
  });

  it('refuses a recorded day exactly one day before the new inclusive fromDate', async () => {
    await seed(null);
    const only = await createAssignment(
      transaction.client,
      manager,
      uuidv7,
      assignment({ fromDate: '2026-07-01', toDate: '2026-07-31' }),
    );
    expect(only.kind).toBe('saved');
    const id = only.kind === 'saved' ? only.id : '';
    await seedCraLine('2026-07-09', MISSION_OPEN);

    const updated = await updateAssignment(
      transaction.client,
      manager,
      id,
      assignment({ fromDate: '2026-07-10', toDate: '2026-07-31' }),
    );

    expect(updated.kind).toBe('refused');
    if (updated.kind === 'refused') {
      expect(updated.problemType).toBe('/problems/assignment-recorded-days');
    }
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

// ---------------------------------------------------------------------------
// Everything above runs on `transaction.client`, one connection wrapped in a savepoint
// (`useTestTransaction`) — enough to prove `validateAssignment`'s own logic, but not the
// advisory lock ADR-0106 adds: a `SELECT pg_advisory_xact_lock(...)` taken twice on the *same*
// session is a no-op, so it needs a second, genuinely independent connection to contend with.
// Same technique as `pg-cra-repository.int.test.ts`'s "lock proofs" (ADR-0103): open two real
// pool connections, hold the first's transaction open past its own write, and prove the second
// blocks until the first commits or rolls back.
// ---------------------------------------------------------------------------

describe('validateAssignment — lock proofs (ADR-0106)', () => {
  const manager2: Actor = {
    consultantId: 'lock-assign-manager',
    officeId: 'lock-assign-office',
    role: 'manager',
  };
  const CONSULTANT2 = 'lock-assign-consultant';
  const MISSION2 = 'lock-assign-mission';

  afterAll(async () => {
    const pool = getPool();
    await pool.query(`DELETE FROM public.assignments WHERE consultant_id = $1`, [CONSULTANT2]);
    await pool.query(`DELETE FROM public.missions WHERE id = $1`, [MISSION2]);
    await pool.query(`DELETE FROM public.clients WHERE id = 'lock-assign-client'`);
    await pool.query(`DELETE FROM public.consultants WHERE id = $1`, [CONSULTANT2]);
    await pool.query(`DELETE FROM public.practices WHERE id = 'lock-assign-practice'`);
    await pool.query(`DELETE FROM public.offices WHERE id = 'lock-assign-office'`);
    await closePool();
  });

  async function seedForLockTests(): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO public.offices (id, name, city) VALUES ('lock-assign-office', 'Lock', 'Lock')
       ON CONFLICT DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO public.practices (id, name) VALUES ('lock-assign-practice', 'Audit')
       ON CONFLICT DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
       VALUES ($1, 'Lock', 'Assign', 'lock-assign@test.com', 'lock-assign-office', 'lock-assign-practice', 'consultant')
       ON CONFLICT DO NOTHING`,
      [CONSULTANT2],
    );
    await pool.query(
      `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
         billing_address_postal_code, billing_address_city, billing_address_country)
       VALUES ('lock-assign-client', 'Lock Assign Client', '443061841', 'metropolitanFrance', '1 rue',
               '75000', 'Paris', 'France')
       ON CONFLICT DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
       VALUES ($1, 'lock-assign-client', 'Lock Assign Mission', 'Regie', '2026-01-01')
       ON CONFLICT DO NOTHING`,
      [MISSION2],
    );
  }

  async function cleanupAssignments(): Promise<void> {
    await getPool().query(`DELETE FROM public.assignments WHERE consultant_id = $1`, [CONSULTANT2]);
  }

  /** Resolved if `promise` settles within `ms`; otherwise proof that it is still pending. */
  async function isStillPending(promise: Promise<unknown>, ms = 500): Promise<boolean> {
    const race = await Promise.race([
      promise.then(() => 'resolved' as const),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => {
          resolve('pending');
        }, ms);
      }),
    ]);
    return race === 'pending';
  }

  it('blocks a second connection creating an overlapping assignment until the first commits, then refuses it', async () => {
    await seedForLockTests();
    const pool = getPool();
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      await clientA.query('BEGIN');
      const resultA = await createAssignment(clientA, manager2, uuidv7, {
        consultantId: CONSULTANT2,
        missionId: MISSION2,
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
      });
      expect(resultA.kind).toBe('saved');
      // A's insert is real inside its own transaction but not yet committed — B must not be able
      // to read it, only to be blocked from proceeding past the same advisory lock.

      await clientB.query('BEGIN');
      const pendingB = createAssignment(clientB, manager2, uuidv7, {
        consultantId: CONSULTANT2,
        missionId: MISSION2,
        fromDate: '2026-07-10',
        toDate: '2026-08-10',
      });

      expect(await isStillPending(pendingB)).toBe(true);

      await clientA.query('COMMIT');
      const resultB = await pendingB;
      await clientB.query('COMMIT');

      // B unblocks, re-reads A's now-committed row, and correctly refuses — never a second,
      // overlapping row inserted by a check that ran before A's commit was visible.
      expect(resultB.kind).toBe('refused');
      if (resultB.kind === 'refused') {
        expect(resultB.problemType).toBe('/problems/assignment-overlap');
      }

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.assignments WHERE consultant_id = $1`,
        [CONSULTANT2],
      );
      expect(Number.parseInt(rows[0]!.count, 10)).toBe(1);
    } finally {
      clientA.release();
      clientB.release();
      await cleanupAssignments();
    }
  });

  it('blocks a second connection creating a genuinely disjoint assignment, then accepts it once unblocked', async () => {
    await seedForLockTests();
    const pool = getPool();
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      await clientA.query('BEGIN');
      const resultA = await createAssignment(clientA, manager2, uuidv7, {
        consultantId: CONSULTANT2,
        missionId: MISSION2,
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      });
      expect(resultA.kind).toBe('saved');

      await clientB.query('BEGIN');
      const pendingB = createAssignment(clientB, manager2, uuidv7, {
        consultantId: CONSULTANT2,
        missionId: MISSION2,
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      });

      // Same lock key (consultant, mission): B is serialized behind A even though the two ranges
      // never overlap — a correctness no-op (ADR-0106's own reconsideration threshold), not a
      // wrong refusal, as the rest of this test confirms.
      expect(await isStillPending(pendingB)).toBe(true);

      await clientA.query('COMMIT');
      const resultB = await pendingB;
      await clientB.query('COMMIT');

      expect(resultB.kind).toBe('saved');

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.assignments WHERE consultant_id = $1`,
        [CONSULTANT2],
      );
      expect(Number.parseInt(rows[0]!.count, 10)).toBe(2);
    } finally {
      clientA.release();
      clientB.release();
      await cleanupAssignments();
    }
  });
});
