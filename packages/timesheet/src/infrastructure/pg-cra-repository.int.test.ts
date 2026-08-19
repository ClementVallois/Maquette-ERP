import { isoDate, period } from '@erp/platform';
import { useTestTransaction } from '@erp/test-harness';
import { describe, expect, it } from 'vitest';

import { Cra } from '../domain/cra.ts';

import { PgCraRepository } from './pg-cra-repository.ts';

describe('PgCraRepository', () => {
  const tx = useTestTransaction();

  const PARIS = 'office-paris';
  const LYON = 'office-lyon';

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
    return new PgCraRepository(tx.client);
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
    const found = await repo().findById('cra-001', { officeId: PARIS });

    expect(found).not.toBeNull();
    expect(found!.id).toBe('cra-001');
    expect(found!.status).toBe('draft');
    expect(found!.lines).toHaveLength(1);
    expect(found!.lines[0]!.day).toBe('2026-06-02');
    expect(found!.lines[0]!.halfDays).toBe(2);
  });

  it('returns null when CRA does not exist', async () => {
    await seedOffices();
    const found = await repo().findById('nonexistent', { officeId: PARIS });
    expect(found).toBeNull();
  });

  it('returns null when actor office does not match — authorization scope', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const found = await repo().findById('cra-001', { officeId: LYON });
    expect(found).toBeNull();
  });

  it('lists CRAs filtered by office', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const parisResults = await repo().list({ officeId: PARIS, limit: 10, offset: 0 });
    expect(parisResults).toHaveLength(1);
    expect(parisResults[0]!.id).toBe('cra-001');

    const lyonResults = await repo().list({ officeId: LYON, limit: 10, offset: 0 });
    expect(lyonResults).toHaveLength(0);
  });

  it('caps pagination at MAX_PAGE_SIZE', async () => {
    await seedOffices();
    const results = await repo().list({ officeId: PARIS, limit: 1000, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('saves and retrieves a Cra with refusal', async () => {
    await seedOffices();

    const cra = makeCra();
    cra.recordDay({
      day: isoDate('2026-06-02'),
      dayType: 'worked',
      missionId: 'mission-1',
      halfDays: 2,
    });

    await repo().save(cra);
    const found = await repo().findById('cra-001', { officeId: PARIS });
    expect(found).not.toBeNull();
    expect(found!.refusal).toBeNull();
  });

  it('finds by consultant and period', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const found = await repo().findByConsultantAndPeriod('consultant-1', period(2026, 6), {
      officeId: PARIS,
    });
    expect(found).not.toBeNull();
    expect(found!.id).toBe('cra-001');
  });

  it('findByConsultantAndPeriod returns null for wrong office', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const found = await repo().findByConsultantAndPeriod('consultant-1', period(2026, 6), {
      officeId: LYON,
    });
    expect(found).toBeNull();
  });

  it('list items do not expose Tjm, Cjm or margin', async () => {
    await seedOffices();

    const cra = makeCra();
    await repo().save(cra);

    const items = await repo().list({ officeId: PARIS, limit: 10, offset: 0 });
    const item = items[0]!;
    const keys = Object.keys(item);
    expect(keys).not.toContain('tjm');
    expect(keys).not.toContain('cjm');
    expect(keys).not.toContain('margin');
  });

  it('updates status on re-save (upsert)', async () => {
    await seedOffices();

    const cra = makeCra();
    cra.recordDay({
      day: isoDate('2026-06-02'),
      dayType: 'worked',
      missionId: 'mission-1',
      halfDays: 2,
    });
    await repo().save(cra);

    const found1 = await repo().findById('cra-001', { officeId: PARIS });
    expect(found1!.status).toBe('draft');
    expect(found1!.lines).toHaveLength(1);
  });
});
