import { useTestTransaction } from '@erp/test-harness';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiFailure } from '../errors.ts';
import { uuidv7 } from '../ids/uuidv7.ts';

import { actorOf, PgPersonaCatalogue } from './catalogue.ts';

/**
 * The catalogue against a real Postgres. It seeds its own rows inside the per-test transaction
 * rather than reading the deterministic seed's: the integration CI job migrates and does not seed,
 * and a test that silently depends on seeded rows is one that passes locally and fails there.
 *
 * What the deterministic seed's own rows prove — that `erp_app` can read them after a real
 * `pnpm run seed` — is asserted by the `Cold setup` CI job, which is the job that has them.
 */

const transaction = useTestTransaction();

interface Fixture {
  readonly parisId: string;
  readonly lyonId: string;
  readonly aliceId: string;
  readonly emmaId: string;
}

let fixture: Fixture;

beforeEach(async () => {
  const { client } = transaction;
  const parisId = uuidv7();
  const lyonId = uuidv7();
  const practiceId = uuidv7();
  const aliceId = uuidv7();
  const emmaId = uuidv7();

  await client.query(
    'INSERT INTO public.offices (id, name, city) VALUES ($1, $2, $2), ($3, $4, $4)',
    [parisId, 'Paris-fixture', lyonId, 'Lyon-fixture'],
  );
  await client.query('INSERT INTO public.practices (id, name) VALUES ($1, $2)', [
    practiceId,
    'Audit-fixture',
  ]);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', $2, $3, $5, 'consultant'),
            ($4, 'Emma', 'Robert', $6, $7, $5, 'manager')`,
    [
      aliceId,
      `alice-${aliceId}@fixture.test`,
      parisId,
      emmaId,
      practiceId,
      `emma-${emmaId}@fixture.test`,
      lyonId,
    ],
  );
  await client.query(
    `INSERT INTO public.personas (id, key, role, consultant_id, display_order)
     VALUES ($1, 'fixture-manager-lyon', 'manager', $2, 901),
            ($3, 'fixture-consultant-paris', 'consultant', $4, 900)`,
    [uuidv7(), emmaId, uuidv7(), aliceId],
  );

  fixture = { parisId, lyonId, aliceId, emmaId };
});

describe('PgPersonaCatalogue', () => {
  it('joins the persona to the office that bounds its scope', async () => {
    const persona = await new PgPersonaCatalogue(transaction.client).byKey('fixture-manager-lyon');

    expect(persona).toStrictEqual({
      key: 'fixture-manager-lyon',
      role: 'manager',
      consultantId: fixture.emmaId,
      officeId: fixture.lyonId,
      officeName: 'Lyon-fixture',
      displayName: 'Emma Robert',
    });
  });

  it('answers null for a key it does not hold', async () => {
    const persona = await new PgPersonaCatalogue(transaction.client).byKey('fixture-nobody');

    expect(persona).toBeNull();
  });

  it('lists in display order, not in insertion order', async () => {
    // The fixtures are inserted manager-first and ordered consultant-first, so a query that
    // forgot its ORDER BY would answer the wrong sequence.
    const listed = await new PgPersonaCatalogue(transaction.client).list();
    const keys = listed.map((persona) => persona.key).filter((key) => key.startsWith('fixture-'));

    expect(keys).toStrictEqual(['fixture-consultant-paris', 'fixture-manager-lyon']);
  });

  it('produces an actor carrying the identity, the office and the role', async () => {
    const persona = await new PgPersonaCatalogue(transaction.client).byKey(
      'fixture-consultant-paris',
    );

    expect(persona).not.toBeNull();
    expect(actorOf(persona!)).toStrictEqual({
      consultantId: fixture.aliceId,
      officeId: fixture.parisId,
      role: 'consultant',
    });
  });

  it('refuses a role the database holds that ROLES does not', async () => {
    // The CHECK constraint names the same three values, so this can only happen if the constraint
    // and `ROLES` drift apart. It is a deployment fault and it fails loudly rather than producing
    // an actor with a role nothing checks.
    const catalogue = new PgPersonaCatalogue({
      query: () =>
        Promise.resolve({
          rows: [
            {
              key: 'k',
              role: 'director',
              consultant_id: 'c',
              office_id: 'o',
              office_name: 'Paris',
              first_name: 'Henri',
              last_name: 'Laurent',
            },
          ],
        }),
    });

    await expect(catalogue.byKey('k')).rejects.toThrow(ApiFailure);
  });

  it('refuses to read a persona whose consultant does not exist', async () => {
    // Not a query test: the FK is what makes the join total, and a persona pointing at nothing
    // would be a row the catalogue silently skips rather than a row that cannot be written.
    await expect(
      transaction.client.query(
        `INSERT INTO public.personas (id, key, role, consultant_id, display_order)
         VALUES ($1, 'fixture-orphan', 'manager', $2, 999)`,
        [uuidv7(), uuidv7()],
      ),
    ).rejects.toThrow(/foreign key/iu);
  });
});
