import { type Actor, isoDate, OutOfScopeError, period } from '@erp/platform';
import { useTestTransaction } from '@erp/test-harness';
import { describe, expect, it } from 'vitest';

import { Cra } from '../domain/cra.ts';
import { hierarchy } from '../domain/hierarchy.ts';
import { timesheetReference } from '../domain/reference.ts';
import { workingCalendar } from '../domain/working-calendar.ts';

import { PgCraRepository } from './pg-cra-repository.ts';

/**
 * Child-row ids for these tests. Not the production generator: the repositories take a factory
 * precisely so that the composition root chooses one (ADR-0041), and a test is a composition
 * root too. Counter-based so a failure names a readable id.
 */
let testIdCounter = 0;
const testIds = (): string => `test-id-${String(++testIdCounter)}`;

describe('PgCraRepository', () => {
  const tx = useTestTransaction();

  const PARIS = 'office-paris';
  const LYON = 'office-lyon';

  // The role dimension arrived with ADR-0023, so an actor is no longer an office alone. The
  // manager reads the office; the consultant reads their own month and nothing else.
  const parisManager: Actor = { consultantId: 'manager-1', officeId: PARIS, role: 'manager' };
  const lyonManager: Actor = { consultantId: 'manager-2', officeId: LYON, role: 'manager' };
  const alice: Actor = { consultantId: 'consultant-1', officeId: PARIS, role: 'consultant' };

  async function seedOffices(): Promise<void> {
    await tx.client.query(`
      INSERT INTO public.offices (id, name, city) VALUES ('office-paris', 'Paris', 'Paris');
      INSERT INTO public.offices (id, name, city) VALUES ('office-lyon', 'Lyon', 'Lyon');
    `);
    await tx.client.query(`
      INSERT INTO public.practices (id, name) VALUES ('practice-audit', 'Audit');
    `);
    await tx.client.query(`
      INSERT INTO public.clients (id, name, territoriality, billing_address_street, billing_address_postal_code, billing_address_city, billing_address_country)
      VALUES ('client-placeholder', 'Client Test', 'metropolitanFrance', '1 rue Test', '75001', 'Paris', 'France');
    `);
    await tx.client.query(`
      INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
      VALUES ('consultant-1', 'Alice', 'Dupont', 'alice@test.com', 'office-paris', 'practice-audit', 'consultant');
      INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
      VALUES ('manager-1', 'Bob', 'Martin', 'bob@test.com', 'office-paris', 'practice-audit', 'manager');
    `);
    await tx.client.query(`
      INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
      VALUES ('mission-1', 'client-placeholder', 'Mission Alpha', 'Regie', '2026-01-01');
    `);
  }

  function repo(): PgCraRepository {
    return new PgCraRepository(tx.client, testIds);
  }

  // The three collaborators `submit` and `validate` need, built for June 2026 against the rows
  // `seedOffices` inserts, so a transition can actually run here instead of being asserted around.
  const fixedClock = { now: () => new Date('2026-07-02T09:00:00.000Z') };
  const juneCalendar = workingCalendar();
  const juneReference = timesheetReference({
    missions: [
      { id: 'mission-1', startDate: '2026-01-01', endDate: null, requiredHabilitations: [] },
    ],
    assignments: [
      { consultantId: 'consultant-1', missionId: 'mission-1', from: '2026-01-01', to: null },
    ],
  });
  const juneHierarchy = hierarchy([
    { consultantId: 'consultant-1', managerId: 'manager-1', from: '2025-01-01', to: null },
  ]);

  /** Every workable day of June worked on `mission-1`: the shape `submit` requires. */
  function makeCompleteCra(): Cra {
    const cra = makeCra();
    for (const day of juneCalendar.workableDaysOf(period(2026, 6))) {
      cra.recordDay({ day, dayType: 'worked', missionId: 'mission-1', halfDays: 2 });
    }
    return cra;
  }

  function makeCra(): Cra {
    return Cra.open({
      id: 'cra-001',
      consultantId: 'consultant-1',
      officeId: PARIS,
      period: period(2026, 6),
    });
  }

  it('saves and retrieves a draft Cra', async () => {
    await seedOffices();

    const cra = makeCra();
    cra.recordDay({
      day: isoDate('2026-06-02'),
      dayType: 'worked',
      missionId: 'mission-1',
      halfDays: 2,
    });

    await repo().save(cra);
    const found = await repo().findById('cra-001', parisManager);

    expect(found).not.toBeNull();
    expect(found!.id).toBe('cra-001');
    expect(found!.status).toBe('draft');
    expect(found!.lines).toHaveLength(1);
    expect(found!.lines[0]!.day).toBe('2026-06-02');
    expect(found!.lines[0]!.halfDays).toBe(2);
  });

  it('returns null when CRA does not exist', async () => {
    await seedOffices();
    const found = await repo().findById('nonexistent', parisManager);
    expect(found).toBeNull();
  });

  it('refuses, rather than hides, a CRA of another office — ADR-0003 beat two', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    // Not `null`: a record that exists and is out of reach raises a typed refusal, because
    // ADR-0003's second beat is a 403 that NAMES the rule and a `null` names nothing.
    await expect(repo().findById('cra-001', lyonManager)).rejects.toThrow(OutOfScopeError);
  });

  it("refuses a consultant a colleague's CRA in their own office", async () => {
    // The dimension office scope alone cannot see: same office, different person.
    await seedOffices();
    await repo().save(makeCra());

    const colleague: Actor = { consultantId: 'someone-else', officeId: PARIS, role: 'consultant' };

    await expect(repo().findById('cra-001', colleague)).rejects.toThrow(OutOfScopeError);
  });

  it('lets a consultant read their own CRA', async () => {
    await seedOffices();
    await repo().save(makeCra());

    const found = await repo().findById('cra-001', alice);

    expect(found).not.toBeNull();
    expect(found!.consultantId).toBe('consultant-1');
  });

  it("lists a consultant's own CRAs only, where the manager lists the whole office", async () => {
    await seedOffices();
    await repo().save(makeCra());

    const asManager = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    const asAlice = await repo().list({ actor: alice, limit: 10, offset: 0 });
    const asColleague = await repo().list({
      actor: { consultantId: 'someone-else', officeId: PARIS, role: 'consultant' },
      limit: 10,
      offset: 0,
    });

    expect(asManager).toHaveLength(1);
    expect(asAlice).toHaveLength(1);
    // Same office, same query, different person: the list is filtered rather than refused —
    // that is ADR-0003's FIRST beat, the empty state.
    expect(asColleague).toHaveLength(0);
  });

  it('lists CRAs filtered by office', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const parisResults = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    expect(parisResults).toHaveLength(1);
    expect(parisResults[0]!.id).toBe('cra-001');

    const lyonResults = await repo().list({ actor: lyonManager, limit: 10, offset: 0 });
    expect(lyonResults).toHaveLength(0);
  });

  it('caps pagination at MAX_PAGE_SIZE, however large the caller asks', async () => {
    // Seeded past the cap on purpose. Asking for 1000 against an empty table also returns "no
    // more than 50" and proves nothing — the cap has to be the reason the answer is short.
    await seedOffices();
    await tx.client.query(`
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
      SELECT 'cra-' || g, 'consultant-1', 'office-paris',
             to_char(DATE '2020-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'draft'
      FROM generate_series(1, 60) AS g
    `);

    const capped = await repo().list({ actor: parisManager, limit: 1000, offset: 0 });
    expect(capped).toHaveLength(50);

    // And a caller under the cap still gets what it asked for, so the fix is not "always 50".
    const asked = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    expect(asked).toHaveLength(10);
  });

  it('round-trips a refusal, with who refused it and why', async () => {
    // This test used to save a fresh draft and assert its refusal was null, under this name. The
    // three refusal columns of migration 002 were written by nothing and read by nothing.
    await seedOffices();

    const cra = makeCompleteCra();
    cra.submit({ clock: fixedClock, calendar: juneCalendar, reference: juneReference });
    cra.refuse({
      by: 'manager-1',
      reason: 'mission-1 was not staffed that week',
      clock: fixedClock,
    });

    await repo().save(cra);
    const found = await repo().findById('cra-001', parisManager);

    expect(found!.status).toBe('refused');
    expect(found!.refusal).not.toBeNull();
    expect(found!.refusal!.by).toBe('manager-1');
    expect(found!.refusal!.reason).toBe('mission-1 was not staffed that week');
    expect(found!.refusal!.at).toBeInstanceOf(Date);
  });

  it('round-trips a validated Cra, with who validated it', async () => {
    // The status the whole chain turns on, and the one no test persisted. `validated_by` and
    // `validated_at` were written by nothing and read by nothing.
    await seedOffices();

    const cra = makeCompleteCra();
    cra.submit({ clock: fixedClock, calendar: juneCalendar, reference: juneReference });
    cra.validate({ by: 'manager-1', clock: fixedClock, hierarchy: juneHierarchy });

    await repo().save(cra);
    const found = await repo().findById('cra-001', parisManager);

    expect(found!.status).toBe('validated');
    expect(found!.validatedBy).toBe('manager-1');
    expect(found!.validatedAt).toBeInstanceOf(Date);
  });

  it('finds by consultant and period', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const found = await repo().findByConsultantAndPeriod(
      'consultant-1',
      period(2026, 6),
      parisManager,
    );
    expect(found).not.toBeNull();
    expect(found!.id).toBe('cra-001');
  });

  it('findByConsultantAndPeriod refuses a CRA of another office', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    await expect(
      repo().findByConsultantAndPeriod('consultant-1', period(2026, 6), lyonManager),
    ).rejects.toThrow(OutOfScopeError);
  });

  it('list items do not expose Tjm, Cjm or margin', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const items = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    const item = items[0]!;

    // Asserted as the WHOLE shape, not as three absent names. `tjm`, `cjm` and `margin` are
    // spellings this codebase never uses — a leak would arrive as `tjmCents` or `cjmCents` and
    // an absence test would stay green. A projection that grows a field fails here instead.
    expect(Object.keys(item).sort()).toStrictEqual([
      'consultantId',
      'id',
      'officeId',
      'period',
      'status',
    ]);
  });

  it('updates status and lines on re-save (upsert)', async () => {
    // Under this name, this test used to save once and assert the status was still `draft`. It
    // never re-saved, so the upsert it is named for ran in no test.
    await seedOffices();

    const cra = makeCra();
    cra.recordDay({
      day: isoDate('2026-06-02'),
      dayType: 'worked',
      missionId: 'mission-1',
      halfDays: 2,
    });
    await repo().save(cra);

    const first = await repo().findById('cra-001', parisManager);
    expect(first!.status).toBe('draft');
    expect(first!.lines).toHaveLength(1);

    const complete = makeCompleteCra();
    complete.submit({ clock: fixedClock, calendar: juneCalendar, reference: juneReference });
    await repo().save(complete);

    const workableDays = juneCalendar.workableDaysOf(period(2026, 6)).length;
    const second = await repo().findById('cra-001', parisManager);
    expect(second!.status).toBe('submitted');
    expect(second!.lines).toHaveLength(workableDays);

    // The rows are replaced, not appended: `#replaceLines` deletes before it inserts.
    const { rows } = await tx.client.query<{ count: string }>(
      `SELECT count(*) AS count FROM timesheet.cra_lines WHERE cra_id = $1`,
      ['cra-001'],
    );
    expect(Number.parseInt(rows[0]!.count, 10)).toBe(workableDays);
  });
});
