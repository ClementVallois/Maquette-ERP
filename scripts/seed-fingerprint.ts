/**
 * A fingerprint of everything the seed wrote: one content hash per table, plus a row count.
 *
 * This exists because "the seed ran twice and exited 0" proves nothing about the two properties
 * ADR-0022 actually claims. The seed clears every table inside one transaction and re-inserts, so
 * a second pass **cannot** fail — and replacing `uuidv7Deterministic` with `crypto.randomUUID`
 * would leave every CI job green while making the ADR's central claim false.
 *
 * Comparing two fingerprints closes both at once. Non-idempotent → the row counts or the hashes
 * move. Non-deterministic → the ids differ between passes, so the hashes move. And the diff names
 * the table, which an `exit 1` would not.
 *
 * The table list is read from the catalogue rather than written down, so a table added by a later
 * migration is covered by this without anybody remembering to add it.
 */

import pg from 'pg';

import { TechnicalFailure } from '@erp/platform';

const { Client } = pg;

class FingerprintError extends TechnicalFailure {
  readonly retryable = false;
}

const SCHEMAS = ['public', 'timesheet', 'billing'];

/** Ignored on purpose: written by `migrate`, not by `seed`, and it carries an `applied` clock. */
const NOT_SEED_DATA = new Set(['schema_migrations']);

/**
 * A database where the seed has not run also produces a stable fingerprint — every table empty,
 * twice. Comparing two of those passes while proving nothing, which is the exact failure this
 * script was written to remove, so an empty result is a refusal rather than a hash.
 */
const MUST_NOT_BE_EMPTY = ['offices', 'consultants', 'missions', 'cras', 'invoices', 'personas'];

async function fingerprint(): Promise<void> {
  const url = process.env['MIGRATION_DATABASE_URL'];
  if (!url) {
    console.error('MIGRATION_DATABASE_URL is not set — run `pnpm run env:init`');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const { rows: tables } = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema = ANY($1) AND table_type = 'BASE TABLE'
       ORDER BY table_schema, table_name`,
      [SCHEMAS],
    );

    const empty: string[] = [];
    for (const { table_schema: schema, table_name: name } of tables) {
      if (NOT_SEED_DATA.has(name)) continue;

      // The whole row as text, hashed per row and then sorted, so the answer does not depend on
      // the order Postgres happens to return rows in.
      const { rows } = await client.query<{ rows: string; hash: string | null }>(
        `SELECT COUNT(*)::text AS rows, md5(string_agg(md5(t::text), '' ORDER BY md5(t::text))) AS hash
         FROM "${schema}"."${name}" t`,
      );
      const row = rows[0];
      if (row === undefined) {
        throw new FingerprintError(`no aggregate row for ${schema}.${name}`);
      }

      if (row.rows === '0' && MUST_NOT_BE_EMPTY.includes(name)) empty.push(`${schema}.${name}`);

      console.log(`${schema}.${name} rows=${row.rows} hash=${row.hash ?? '-'}`);
    }

    if (empty.length > 0) {
      console.error(
        `Refusing to fingerprint a database the seed has not populated: ${empty.join(', ')} ` +
          'is empty. Two matching fingerprints of an empty database prove nothing.',
      );
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

await fingerprint();
