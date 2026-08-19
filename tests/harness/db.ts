import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';

import { HarnessMisconfiguredError } from './errors.ts';

const { Pool } = pg;

/**
 * The harness is a composition root too — the integration tests construct repositories directly,
 * with no `apps/api` in sight — so it installs the same process-global the application's root
 * installs. It used to arrive as an import side effect of whichever repository was loaded first,
 * which meant two sealed modules silently deciding it for each other (open question, 19/08/2026).
 *
 * `pg`'s default DATE parser builds a `Date` in the local timezone, shifting a worked day by one
 * when the machine is not UTC. A worked day is a `date` (BUILD-RULES) and must survive a round
 * trip unchanged.
 */
pg.types.setTypeParser(1082, (value: string) => value);

let pool: InstanceType<typeof Pool> | null = null;

function loadEnvIfMissing(): void {
  if (process.env['DATABASE_URL']) return;

  const envPath = resolve(import.meta.dirname, '..', '..', '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvIfMissing();

function connectionString(): string {
  const url = process.env['DATABASE_URL'];
  if (!url)
    throw new HarnessMisconfiguredError('DATABASE_URL is not set — run `pnpm run env:init`');

  return url;
}

function migrationConnectionString(): string {
  const url = process.env['MIGRATION_DATABASE_URL'];
  if (!url)
    throw new HarnessMisconfiguredError(
      'MIGRATION_DATABASE_URL is not set — run `pnpm run env:init`',
    );

  return url;
}

export function getPool(): InstanceType<typeof Pool> {
  pool ??= new Pool({ connectionString: connectionString() });

  return pool;
}

export function getMigrationPool(): InstanceType<typeof Pool> {
  return new Pool({ connectionString: migrationConnectionString() });
}

export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
