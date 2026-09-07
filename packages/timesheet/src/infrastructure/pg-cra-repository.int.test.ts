import { type Actor, isoDate, OutOfScopeError, period } from '@erp/platform';
import { closePool, getPool, useTestTransaction } from '@erp/test-harness';
import { afterAll, describe, expect, it } from 'vitest';

import { Cra } from '../domain/cra.ts';
import { CraAlreadyExistsError } from '../domain/errors.ts';
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
      cra.recordDay({ day, dayType: 'worked', missionId: 'mission-1', quarterDays: 4 });
    }
    return cra;
  }

  function makeCra(): Cra {
    return Cra.open({
      id: 'cra-001',
      consultantId: 'consultant-1',
      officeId: PARIS,
      period: period(2026, 6),
      consultantDeparture: null,
    });
  }

  it('saves and retrieves a draft Cra', async () => {
    await seedOffices();

    const cra = makeCra();
    cra.recordDay({
      day: isoDate('2026-06-02'),
      dayType: 'worked',
      missionId: 'mission-1',
      quarterDays: 4,
    });

    await repo().save(cra);
    const found = await repo().findById('cra-001', parisManager);

    expect(found).not.toBeNull();
    expect(found!.id).toBe('cra-001');
    expect(found!.status).toBe('draft');
    expect(found!.lines).toHaveLength(1);
    expect(found!.lines[0]!.day).toBe('2026-06-02');
    expect(found!.lines[0]!.quarterDays).toBe(4);
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

  it('carries the quarter-days recorded, so a caller need not fetch each Cra to count them', async () => {
    // ADR-0053: the pré-facturier's late-days counter is a sum over this column. It is a
    // quantity and not a rate — `Cjm`, `Tjm` and margin stay out of every list view.
    await seedOffices();
    await repo().save(makeCra());

    const listed = await repo().list({ actor: parisManager, limit: 10, offset: 0 });

    expect(listed[0]!.recordedQuarterDays).toBe(
      makeCra().lines.reduce((sum, line) => sum + line.quarterDays, 0),
    );
  });

  it('carries zero quarter-days for a Cra with no line, rather than dropping the row', async () => {
    // A LEFT JOIN, not an inner one: a month that was opened and never filled is exactly the row
    // the pré-facturier has to show, and an inner join would hide it.
    await seedOffices();
    await tx.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ('cra-empty', 'consultant-1', 'office-paris', '2026-05', 'draft')`,
    );

    const listed = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    const empty = listed.find((row) => row.id === 'cra-empty');

    expect(empty).toBeDefined();
    expect(empty!.recordedQuarterDays).toBe(0);
  });

  it('narrows to one period when asked, and to every period when not', async () => {
    // The pré-facturier reads one month (ADR-0053). Filtering a capped page in memory would
    // truncate the month itself the moment an office holds more than a page across all months.
    await seedOffices();
    await repo().save(makeCra());
    await tx.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ('cra-may', 'consultant-1', 'office-paris', '2026-05', 'draft')`,
    );

    const june = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      period: '2026-06',
    });
    expect(june.map((row) => row.id)).toStrictEqual(['cra-001']);

    const july = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      period: '2026-07',
    });
    expect(july).toStrictEqual([]);

    expect(await repo().list({ actor: parisManager, limit: 10, offset: 0 })).toHaveLength(2);
  });

  it('narrows to the given consultants, and to every consultant the actor may see when not', async () => {
    // Item 7 (QA round 1): "for these three consultants, every CRA not yet validated" needs the
    // consultant dimension server-side.
    await seedOffices();
    await repo().save(makeCra());
    await tx.client.query(`
      INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
      VALUES ('consultant-2', 'Chloé', 'Petit', 'chloe@test.com', 'office-paris', 'practice-audit', 'consultant');
    `);
    await tx.client.query(`
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
      VALUES ('cra-002', 'consultant-2', 'office-paris', '2026-06', 'draft');
    `);

    const onlyAlice = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      consultantIds: ['consultant-1'],
    });
    expect(onlyAlice.map((row) => row.id)).toStrictEqual(['cra-001']);

    const both = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      consultantIds: ['consultant-1', 'consultant-2'],
    });
    expect(both.map((row) => row.id).sort()).toStrictEqual(['cra-001', 'cra-002']);

    expect(await repo().list({ actor: parisManager, limit: 10, offset: 0 })).toHaveLength(2);
  });

  it('the consultant filter narrows within the actor’s own scope, and never widens it', async () => {
    // The office boundary (`c.office_id = $1`) is applied before `consultantIds` in the SQL —
    // this is what proves it, rather than assuming the WHERE clause order the source reads.
    // Asking as the *wrong* office's manager for a consultant id that is real, but not in that
    // office, must still answer empty, not that consultant's row.
    await seedOffices();
    await repo().save(makeCra());

    const lyonManagerAskingForAParisConsultant = await repo().list({
      actor: lyonManager,
      limit: 10,
      offset: 0,
      consultantIds: ['consultant-1'],
    });
    expect(lyonManagerAskingForAParisConsultant).toStrictEqual([]);

    // Same shape, for a consultant actor: asking for a colleague's id narrows to nothing, not to
    // the colleague's own row — `scope === 'own'` already pins `consultant_id = $2`, and
    // `consultantIds` only ANDs onto that, never replaces it.
    const aliceAskingForSomeoneElse = await repo().list({
      actor: alice,
      limit: 10,
      offset: 0,
      consultantIds: ['someone-else'],
    });
    expect(aliceAskingForSomeoneElse).toStrictEqual([]);
  });

  it('narrows to the given statuses, and to every status the actor may see when not', async () => {
    await seedOffices();
    await repo().save(makeCra()); // 'draft' (Cra.open's own default)
    await tx.client.query(`
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
      VALUES ('cra-submitted', 'consultant-1', 'office-paris', '2026-07', 'submitted');
    `);

    const onlySubmitted = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      statuses: ['submitted'],
    });
    expect(onlySubmitted.map((row) => row.id)).toStrictEqual(['cra-submitted']);

    const draftOrRefused = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      statuses: ['draft', 'refused'],
    });
    expect(draftOrRefused.map((row) => row.id)).toStrictEqual(['cra-001']);

    // Non-exclusive across dimensions, the brief's own example: these consultants AND this
    // status, combined.
    const combined = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      consultantIds: ['consultant-1'],
      statuses: ['submitted'],
    });
    expect(combined.map((row) => row.id)).toStrictEqual(['cra-submitted']);

    expect(await repo().list({ actor: parisManager, limit: 10, offset: 0 })).toHaveLength(2);
  });

  it('narrows by year, by month, and by both — the single-digit month padded', async () => {
    // Item 4 (QA round 2). The trap this covers is in the SQL, not in the API: `period` is
    // `YYYY-MM` text (migration 002), so the filter is `left(period, 4)` and `right(period, 2)`,
    // and an unpadded '6' would never match '06'. `api.int.test.ts` exercises the same filters
    // end to end; this is the layer that does the padding.
    await seedOffices();
    await repo().save(makeCra()); // 2026-06
    await tx.client.query(`
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
      VALUES ('cra-2016-06', 'consultant-1', 'office-paris', '2016-06', 'validated');
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
      VALUES ('cra-2026-11', 'consultant-1', 'office-paris', '2026-11', 'draft');
    `);

    const of2016 = await repo().list({ actor: parisManager, limit: 10, offset: 0, year: 2016 });
    expect(of2016.map((row) => row.id)).toStrictEqual(['cra-2016-06']);

    // Month alone crosses years: June 2016 and June 2026 both answer, and November does not.
    const everyJune = await repo().list({ actor: parisManager, limit: 10, offset: 0, month: 6 });
    expect(everyJune.map((row) => row.id).sort()).toStrictEqual(['cra-001', 'cra-2016-06']);

    const june2026 = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      year: 2026,
      month: 6,
    });
    expect(june2026.map((row) => row.id)).toStrictEqual(['cra-001']);

    // A double-digit month is the other half of the padding: `right(period, 2)` reads '11'.
    const november = await repo().list({ actor: parisManager, limit: 10, offset: 0, month: 11 });
    expect(november.map((row) => row.id)).toStrictEqual(['cra-2026-11']);

    expect(await repo().list({ actor: parisManager, limit: 10, offset: 0 })).toHaveLength(3);
  });

  it('the year and month filters narrow within the actor’s own scope, and never widen it', async () => {
    // Same negative as `consultantIds` above: the office boundary is applied before these two in
    // the SQL, so a Lyon manager asking for a year that only Paris holds gets nothing rather than
    // the Paris row.
    await seedOffices();
    await repo().save(makeCra());

    expect(
      await repo().list({ actor: lyonManager, limit: 10, offset: 0, year: 2026, month: 6 }),
    ).toStrictEqual([]);

    // And a year nobody holds is empty rather than unfiltered — the filter is not silently
    // dropped when it matches no row.
    expect(
      await repo().list({ actor: parisManager, limit: 10, offset: 0, year: 2024 }),
    ).toStrictEqual([]);
  });

  it('caps pagination at MAX_PAGE_SIZE (200), however large the caller asks', async () => {
    // Seeded past the cap on purpose. Asking for 1000 against an empty table also returns "no
    // more than the cap" and proves nothing — the cap has to be the reason the answer is short.
    // 250 rows, not 60: ADR-0081 (item 6/step 3, QA round 1) raised this repository's own cap
    // from 50 to 200 once the seed's roster expansion measured a real office clearing 50 Cras
    // (Paris, 65) — a fixture of 60 would now return in full and prove nothing about the cap
    // that actually governs this route today.
    await seedOffices();
    await tx.client.query(`
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
      SELECT 'cra-' || g, 'consultant-1', 'office-paris',
             to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'draft'
      FROM generate_series(1, 250) AS g
    `);

    const capped = await repo().list({ actor: parisManager, limit: 1000, offset: 0 });
    expect(capped).toHaveLength(200);

    // And a caller under the cap still gets what it asked for, so the fix is not "always 200".
    const asked = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    expect(asked).toHaveLength(10);
  });

  it('a manager with more than the old 50-row cap’s worth of Cras sees every one of them, unfiltered (ADR-0081)', async () => {
    // The regression item 6/step 3 (QA round 1) exists to close: before ADR-0081, an office past
    // fifty Cras answered `GET /api/v1/cras` wrong (silently truncated) rather than thin. 65 rows
    // — the exact worst case the roster expansion measured for Paris — asked for at the old
    // default of 50 and answered in full.
    await seedOffices();
    await tx.client.query(`
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
      SELECT 'cra-' || g, 'consultant-1', 'office-paris',
             to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'draft'
      FROM generate_series(1, 65) AS g
    `);

    const overOldCap = await repo().list({ actor: parisManager, limit: 65, offset: 0 });
    expect(overOldCap).toHaveLength(65);
  });

  describe('package 08 — scoped aggregates over the complete office, never a page', () => {
    it("lists every one of a consultant's own refused periods, past the 200-row cap", async () => {
      await seedOffices();
      // 210 > MAX_PAGE_SIZE (200): a page-derived `refusedPeriods` (list, filter, map) would drop
      // the ten oldest — the ones `ORDER BY period DESC` pushes past row 200.
      await tx.client.query(`
        INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
        SELECT 'refused-' || g, 'consultant-1', 'office-paris',
               to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'refused'
        FROM generate_series(1, 210) AS g
      `);

      const periods = await repo().refusedPeriods('consultant-1', parisManager);

      expect(periods).toHaveLength(210);
      // g=1 -> 2000-02, the oldest — the exact row a 200-row page ordered newest-first would drop.
      expect(periods).toContain('2000-02');
    });

    it("answers empty for a consultant outside the actor's own scope", async () => {
      await seedOffices();
      await tx.client.query(`
        INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
        VALUES ('cra-other', 'manager-1', 'office-paris', '2026-06', 'refused')
      `);

      expect(await repo().refusedPeriods('manager-1', alice)).toStrictEqual([]);
    });

    it('finds the true most recently status-changed Cra, past the 200-row cap, on its own time axis', async () => {
      await seedOffices();
      // Period and `submitted_at` deliberately run in *opposite* directions: `list`'s own page is
      // ordered by period, not by `statusChangedAt` — a recent-activity feed sliced from that page
      // would be sorted on the wrong axis entirely, on top of the same cap defect.
      await tx.client.query(`
        INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
        SELECT 'recent-' || g, 'consultant-1', 'office-paris',
               to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'submitted',
               TIMESTAMPTZ '2000-01-01' + (g || ' day')::interval
        FROM generate_series(1, 210) AS g
      `);

      const recent = await repo().recentActivity(parisManager, 3);

      // g=210 has the latest `submitted_at` — the true most recent, invisible to any read capped
      // at 200 rows ordered by period (the same axis, ascending here, that g itself walks).
      expect(recent.map((row) => row.id)).toStrictEqual(['recent-210', 'recent-209', 'recent-208']);
    });

    it('finds the true oldest-submitted Cra awaiting a decision, past the 200-row cap', async () => {
      await seedOffices();
      await tx.client.query(`
        INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
        SELECT 'await-' || g, 'consultant-1', 'office-paris',
               to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'submitted',
               TIMESTAMPTZ '2000-01-01' + (g || ' day')::interval
        FROM generate_series(1, 210) AS g
      `);

      const awaiting = await repo().awaitingDecision(parisManager, 3);

      // g=1 has the earliest `submitted_at` — the oldest decision still pending, the one a
      // 200-row page (whichever 200 of the 210 it happened to keep) is not guaranteed to contain.
      expect(awaiting.map((row) => row.id)).toStrictEqual(['await-1', 'await-2', 'await-3']);
    });

    it('recentActivity and awaitingDecision answer nothing for another office', async () => {
      // The audit's own "Done when" for package 08 closes with "and all queries retain
      // role/office scope" — the same claim every pre-existing list read here already carries a
      // dedicated negative test for, extended to these two new reads.
      await seedOffices();
      await tx.client.query(`
        INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
        VALUES ('cra-scope', 'consultant-1', 'office-paris', '2026-06', 'submitted', '2026-06-01')
      `);

      expect(await repo().recentActivity(lyonManager, 10)).toStrictEqual([]);
      expect(await repo().awaitingDecision(lyonManager, 10)).toStrictEqual([]);
    });

    it("recentActivity and awaitingDecision narrow to a consultant's own Cras, never widen to the office", async () => {
      await seedOffices();
      await tx.client.query(`
        INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
        VALUES ('consultant-2', 'Chloé', 'Nguyen', 'chloe@test.com', 'office-paris', 'practice-audit', 'consultant')
      `);
      await tx.client.query(`
        INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
        VALUES ('cra-alice', 'consultant-1', 'office-paris', '2026-06', 'submitted', '2026-06-01'),
               ('cra-chloe', 'consultant-2', 'office-paris', '2026-06', 'submitted', '2026-06-02')
      `);

      const recent = await repo().recentActivity(alice, 10);
      const awaiting = await repo().awaitingDecision(alice, 10);

      expect(recent.map((row) => row.id)).toStrictEqual(['cra-alice']);
      expect(awaiting.map((row) => row.id)).toStrictEqual(['cra-alice']);
    });
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
      hierarchy: juneHierarchy,
    });

    await repo().save(cra);
    const found = await repo().findById('cra-001', parisManager);

    expect(found!.status).toBe('refused');
    expect(found!.refusal).not.toBeNull();
    expect(found!.refusal!.by).toBe('manager-1');
    expect(found!.refusal!.reason).toBe('mission-1 was not staffed that week');
    expect(found!.refusal!.at).toBeInstanceOf(Date);
    // Not just "is a Date" (package 07): the round trip goes through `TIMESTAMPTZ` storage and
    // the aggregate's own defensive-copy boundary (ADR-0108) on the way back out — this proves the
    // instant survives both, not only that some `Date` came back.
    expect(found!.refusal!.at.getTime()).toBe(fixedClock.now().getTime());
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
    // Same instant-preservation proof as the refusal round trip above (package 07, ADR-0108).
    expect(found!.validatedAt!.getTime()).toBe(fixedClock.now().getTime());
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
      // A quantity, added by ADR-0053 for the late-days counter. It is listed here rather than
      // exempted: this assertion exists so that widening the projection is a decision somebody
      // took, and the only way to take it is to come and write the new name down.
      'recordedQuarterDays',
      'status',
      'statusChangedAt',
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
      quarterDays: 4,
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
    // Instant-preservation proof for `submittedAt`, the third of the three copied `Date` fields
    // (package 07, ADR-0108) — `validatedAt`/`refusal.at` have their own dedicated tests above.
    expect(second!.submittedAt!.getTime()).toBe(fixedClock.now().getTime());

    // The rows are replaced, not appended: `#replaceLines` deletes before it inserts.
    const { rows } = await tx.client.query<{ count: string }>(
      `SELECT count(*) AS count FROM timesheet.cra_lines WHERE cra_id = $1`,
      ['cra-001'],
    );
    expect(Number.parseInt(rows[0]!.count, 10)).toBe(workableDays);
  });

  describe('findByIdForWrite and findByConsultantAndPeriodForWrite (ADR-0103)', () => {
    it('findByIdForWrite reads the same Cra findById does', async () => {
      await seedOffices();
      await repo().save(makeCra());

      const found = await repo().findByIdForWrite('cra-001', parisManager);
      expect(found).not.toBeNull();
      expect(found!.id).toBe('cra-001');
    });

    it('findByIdForWrite returns null for a Cra that does not exist', async () => {
      await seedOffices();
      const found = await repo().findByIdForWrite('nonexistent', parisManager);
      expect(found).toBeNull();
    });

    it('findByIdForWrite refuses, rather than hides, a Cra of another office', async () => {
      await seedOffices();
      await repo().save(makeCra());

      await expect(repo().findByIdForWrite('cra-001', lyonManager)).rejects.toThrow(
        OutOfScopeError,
      );
    });

    it('findByConsultantAndPeriodForWrite reads the same Cra findByConsultantAndPeriod does', async () => {
      await seedOffices();
      await repo().save(makeCra());

      const found = await repo().findByConsultantAndPeriodForWrite(
        'consultant-1',
        period(2026, 6),
        parisManager,
      );
      expect(found).not.toBeNull();
      expect(found!.id).toBe('cra-001');
    });

    it('findByConsultantAndPeriodForWrite returns null for a month with no Cra yet', async () => {
      await seedOffices();
      const found = await repo().findByConsultantAndPeriodForWrite(
        'consultant-1',
        period(2026, 6),
        parisManager,
      );
      expect(found).toBeNull();
    });

    it('findByConsultantAndPeriodForWrite refuses a Cra of another office', async () => {
      await seedOffices();
      await repo().save(makeCra());

      await expect(
        repo().findByConsultantAndPeriodForWrite('consultant-1', period(2026, 6), lyonManager),
      ).rejects.toThrow(OutOfScopeError);
    });
  });

  describe('save — the second boundary of ADR-0103’s creation guard', () => {
    it('maps a (consultant, period) collision to a typed CraAlreadyExistsError, not a raw constraint violation', async () => {
      await seedOffices();

      await repo().save(
        Cra.open({
          id: 'cra-first',
          consultantId: 'consultant-1',
          officeId: PARIS,
          period: period(2026, 6),
          consultantDeparture: null,
        }),
      );

      // A second, distinct Cra id for the same (consultant, period): unreachable through
      // `findByConsultantAndPeriodForWrite`'s advisory lock in the ordinary write path, and
      // exercised directly here — the same way `saveDraft`'s own catch is proven in `billing`.
      await expect(
        repo().save(
          Cra.open({
            id: 'cra-second',
            consultantId: 'consultant-1',
            officeId: PARIS,
            period: period(2026, 6),
            consultantDeparture: null,
          }),
        ),
      ).rejects.toThrow(CraAlreadyExistsError);
    });
  });
});

// ---------------------------------------------------------------------------
// Lock proofs (ADR-0103) — real pool clients, not the per-test savepoint harness above:
// `FOR UPDATE` against your own already-held lock is a no-op, and so is an advisory lock taken
// twice on the same session. Both need a second, genuinely independent connection to contend with.
// ---------------------------------------------------------------------------

describe('PgCraRepository — lock proofs (ADR-0103)', () => {
  const managerActor: Actor = {
    consultantId: 'lock-manager',
    officeId: 'lock-office',
    role: 'manager',
  };

  afterAll(async () => {
    await closePool();
  });

  async function seedForLockTests(): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO public.offices (id, name, city) VALUES ('lock-office', 'Lock', 'Lock')
       ON CONFLICT DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO public.practices (id, name) VALUES ('lock-practice', 'Audit')
       ON CONFLICT DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
       VALUES ('lock-consultant', 'Lock', 'Test', 'lock@test.com', 'lock-office', 'lock-practice', 'consultant')
       ON CONFLICT DO NOTHING`,
    );
  }

  async function cleanupCra(id: string): Promise<void> {
    const pool = getPool();
    await pool.query(`DELETE FROM timesheet.cra_lines WHERE cra_id = $1`, [id]);
    await pool.query(`DELETE FROM timesheet.cra_flags WHERE cra_id = $1`, [id]);
    await pool.query(`DELETE FROM timesheet.cras WHERE id = $1`, [id]);
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

  it('findByIdForWrite blocks a second connection until the first commits', async () => {
    await seedForLockTests();
    const pool = getPool();
    // Committed before either lock-holding transaction opens: a row inserted but not yet
    // committed by A would be invisible to B under READ COMMITTED, and B's `FOR UPDATE` would
    // find zero rows and return immediately — proving nothing about the lock this test targets.
    await new PgCraRepository(pool, testIds).save(
      Cra.open({
        id: 'lock-cra-row',
        consultantId: 'lock-consultant',
        officeId: 'lock-office',
        period: period(2026, 6),
        consultantDeparture: null,
      }),
    );
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      await clientA.query('BEGIN');
      // A locks the pre-existing, already-committed row.
      const lockedByA = await new PgCraRepository(clientA, testIds).findByIdForWrite(
        'lock-cra-row',
        managerActor,
      );
      expect(lockedByA!.status).toBe('draft');

      await clientB.query('BEGIN');
      const pendingB = new PgCraRepository(clientB, testIds).findByIdForWrite(
        'lock-cra-row',
        managerActor,
      );

      expect(await isStillPending(pendingB)).toBe(true);

      await clientA.query('COMMIT');
      const foundByB = await pendingB;
      await clientB.query('COMMIT');

      expect(foundByB!.id).toBe('lock-cra-row');
    } finally {
      clientA.release();
      clientB.release();
      await cleanupCra('lock-cra-row');
    }
  });

  it('findByConsultantAndPeriodForWrite blocks a second connection on a month with no Cra yet', async () => {
    await seedForLockTests();
    const pool = getPool();
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      await clientA.query('BEGIN');
      // Nothing exists yet: only the advisory lock protects this window, since a row lock has no
      // row to take.
      const heldByA = await new PgCraRepository(clientA, testIds).findByConsultantAndPeriodForWrite(
        'lock-consultant',
        period(2026, 7),
        managerActor,
      );
      expect(heldByA).toBeNull();

      await clientB.query('BEGIN');
      const pendingB = new PgCraRepository(clientB, testIds).findByConsultantAndPeriodForWrite(
        'lock-consultant',
        period(2026, 7),
        managerActor,
      );

      expect(await isStillPending(pendingB)).toBe(true);

      // A creates the Cra and commits, releasing the advisory lock.
      await new PgCraRepository(clientA, testIds).save(
        Cra.open({
          id: 'lock-cra-created',
          consultantId: 'lock-consultant',
          officeId: 'lock-office',
          period: period(2026, 7),
          consultantDeparture: null,
        }),
      );
      await clientA.query('COMMIT');

      // B unblocks and finds the row A created — an edit, never a duplicate create.
      const foundByB = await pendingB;
      await clientB.query('COMMIT');

      expect(foundByB!.id).toBe('lock-cra-created');
    } finally {
      clientA.release();
      clientB.release();
      await cleanupCra('lock-cra-created');
    }
  });
});
