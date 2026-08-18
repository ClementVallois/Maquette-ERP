import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';

const { Pool } = pg;

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
  if (!url) throw new Error('DATABASE_URL is not set — run `pnpm run env:init`');

  return url;
}

function migrationConnectionString(): string {
  const url = process.env['MIGRATION_DATABASE_URL'];
  if (!url) throw new Error('MIGRATION_DATABASE_URL is not set — run `pnpm run env:init`');

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
