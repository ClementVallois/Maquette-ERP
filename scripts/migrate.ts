import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import pg from 'pg';

const { Client } = pg;

const MIGRATIONS_DIR = resolve(import.meta.dirname, '..', 'migrations');

async function migrate(): Promise<void> {
  const url = process.env['MIGRATION_DATABASE_URL'];
  if (!url) {
    console.error('MIGRATION_DATABASE_URL is not set — run `pnpm run env:init`');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version  INTEGER PRIMARY KEY,
        name     TEXT NOT NULL,
        applied  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    );
    const applied = new Set(rows.map((row) => row.version));

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      const match = /^(\d+)[-_]/.exec(file);
      if (!match?.[1]) {
        console.error(`Migration file ${file} does not start with a number — skipping`);
        continue;
      }

      const version = Number.parseInt(match[1], 10);
      if (applied.has(version)) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`Applying migration ${file}…`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          version,
          file,
        ]);
        await client.query('COMMIT');
        count += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log(count === 0 ? 'No pending migrations.' : `Applied ${String(count)} migration(s).`);
  } finally {
    await client.end();
  }
}

migrate().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
