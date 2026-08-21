import { describe, expect, it } from 'vitest';

import { useTestTransaction } from '@erp/test-harness';

/**
 * The six tables migration 007 created, and the two guards it added.
 *
 * ADR-0019 extends TDD to persistence: every migration is tested by the time it merges. 007 was
 * the first one where that had to be done deliberately — migrations 001 to 006 are reached
 * indirectly by the two repository tests, while 007's tables had no repository and no reader — and
 * it merged untested. The consequence a reviewer found: `cjm_cents % 100 = 0` and
 * `tjm_cents % 100 = 0` could be **deleted from the file** and every CI job would stay green.
 *
 * The `% 100` rule is the schema half of `docs/BUILD-RULES.md` § Money — a daily rate is a whole
 * number of euros — with the seed's Zod schema in front of it. Two layers, and this is the one
 * that holds when a row arrives by any route other than the seed.
 */

describe('migration 007 — grades and habilitations', () => {
  const tx = useTestTransaction();

  /** A refusal aborts the transaction the harness rolls back, so each one runs in a savepoint. */
  async function refuses(sql: string, params: readonly unknown[] = []): Promise<unknown> {
    await tx.client.query('SAVEPOINT probe');
    try {
      await tx.client.query(sql, [...params]);
      return null;
    } catch (error) {
      return error;
    } finally {
      await tx.client.query('ROLLBACK TO SAVEPOINT probe');
    }
  }

  async function seedRow(): Promise<void> {
    await tx.client.query(`
      INSERT INTO public.offices (id, name, city) VALUES ('m7-office', 'Paris', 'Paris');
      INSERT INTO public.practices (id, name) VALUES ('m7-practice', 'Audit');
      INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
      VALUES ('m7-consultant', 'Alice', 'Martin', 'm7@test', 'm7-office', 'm7-practice', 'consultant');
      INSERT INTO public.clients (id, name, territoriality, billing_address_street,
        billing_address_postal_code, billing_address_city, billing_address_country)
      VALUES ('m7-client', 'Banque Nord SA', 'metropolitanFrance', '12 rue', '75008', 'Paris', 'FR');
      INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
      VALUES ('m7-mission', 'm7-client', 'Audit PASSI', 'Regie', '2026-01-05');
      INSERT INTO public.grades (id, name, rank) VALUES ('m7-grade', 'Confirmé', 900);
      INSERT INTO public.habilitations (id, name) VALUES ('m7-habilitation', 'PASSI');
    `);
  }

  it('accepts a row in each of the six tables', async () => {
    await seedRow();

    await tx.client.query(
      `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, to_date, cjm_cents)
       VALUES ('m7-cg', 'm7-consultant', 'm7-grade', '2024-01-01', NULL, 25000)`,
    );
    await tx.client.query(
      `INSERT INTO public.grade_tjm_defaults (id, grade_id, from_date, to_date, tjm_cents)
       VALUES ('m7-gd', 'm7-grade', '2024-01-01', NULL, 75000)`,
    );
    await tx.client.query(
      `INSERT INTO public.consultant_habilitations (id, consultant_id, habilitation_id, obtained_at, expires_at)
       VALUES ('m7-ch', 'm7-consultant', 'm7-habilitation', '2025-03-15', NULL)`,
    );
    await tx.client.query(
      `INSERT INTO public.mission_habilitations (id, mission_id, habilitation_id)
       VALUES ('m7-mh', 'm7-mission', 'm7-habilitation')`,
    );

    const { rows } = await tx.client.query<{ cjm_cents: string }>(
      `SELECT cjm_cents FROM public.consultant_grades WHERE id = 'm7-cg'`,
    );
    expect(rows[0]!.cjm_cents).toBe('25000');
  });

  it('refuses a Cjm that is not a whole number of euros', async () => {
    // 250,50 € — the shape a decimal rate takes once it has been read as cents. The guard exists
    // because a Cjm is a daily rate and a daily rate is whole euros, and it is what makes the
    // seed's Zod refusal a second line of defence rather than the only one.
    await seedRow();

    const error = await refuses(
      `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, to_date, cjm_cents)
       VALUES ('m7-cg', 'm7-consultant', 'm7-grade', '2024-01-01', NULL, 25050)`,
    );

    expect(error).not.toBeNull();
    expect(String(error)).toContain('consultant_grades');
  });

  it('refuses a Cjm of zero or below', async () => {
    await seedRow();

    for (const cents of [0, -25000]) {
      const error = await refuses(
        `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, to_date, cjm_cents)
         VALUES ('m7-cg', 'm7-consultant', 'm7-grade', '2024-01-01', NULL, $1)`,
        [cents],
      );

      expect(error).not.toBeNull();
    }
  });

  it('refuses a default Tjm that is not a whole number of euros', async () => {
    await seedRow();

    const error = await refuses(
      `INSERT INTO public.grade_tjm_defaults (id, grade_id, from_date, to_date, tjm_cents)
       VALUES ('m7-gd', 'm7-grade', '2024-01-01', NULL, 75050)`,
    );

    expect(error).not.toBeNull();
    expect(String(error)).toContain('grade_tjm_defaults');
  });

  it('refuses a default Tjm of zero or below', async () => {
    await seedRow();

    for (const cents of [0, -75000]) {
      const error = await refuses(
        `INSERT INTO public.grade_tjm_defaults (id, grade_id, from_date, to_date, tjm_cents)
         VALUES ('m7-gd', 'm7-grade', '2024-01-01', NULL, $1)`,
        [cents],
      );

      expect(error).not.toBeNull();
    }
  });

  it('refuses a grade assignment pointing at a consultant or a grade that does not exist', async () => {
    await seedRow();

    expect(
      await refuses(
        `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, cjm_cents)
         VALUES ('m7-cg', 'm7-ghost', 'm7-grade', '2024-01-01', 25000)`,
      ),
    ).not.toBeNull();

    expect(
      await refuses(
        `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, cjm_cents)
         VALUES ('m7-cg', 'm7-consultant', 'm7-ghost', '2024-01-01', 25000)`,
      ),
    ).not.toBeNull();
  });

  it('refuses a habilitation link pointing at a mission or a clearance that does not exist', async () => {
    await seedRow();

    expect(
      await refuses(
        `INSERT INTO public.mission_habilitations (id, mission_id, habilitation_id)
         VALUES ('m7-mh', 'm7-ghost', 'm7-habilitation')`,
      ),
    ).not.toBeNull();

    expect(
      await refuses(
        `INSERT INTO public.consultant_habilitations (id, consultant_id, habilitation_id, obtained_at)
         VALUES ('m7-ch', 'm7-consultant', 'm7-ghost', '2025-03-15')`,
      ),
    ).not.toBeNull();
  });

  it('refuses two grades claiming the same rank, which is what orders them', async () => {
    await seedRow();

    const error = await refuses(
      `INSERT INTO public.grades (id, name, rank) VALUES ('m7-grade-2', 'Senior', 900)`,
    );

    expect(error).not.toBeNull();
  });
});
