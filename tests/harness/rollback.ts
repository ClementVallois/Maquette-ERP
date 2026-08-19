import type pg from 'pg';
import { afterAll, afterEach, beforeEach } from 'vitest';

import { getPool, closePool } from './db.ts';
import { HarnessMisconfiguredError } from './errors.ts';

export interface TestTransaction {
  readonly client: pg.PoolClient;
}

/**
 * Opens a transaction before each test, rolls it back after. Tests are isolated from each other
 * without TRUNCATE or per-test databases — a technique ADR-0019 chose for its single cost: the
 * test must use this client for every query, not the pool directly.
 */
export function useTestTransaction(): TestTransaction {
  const handle: { client: pg.PoolClient | null } = { client: null };

  const ref: TestTransaction = {
    get client(): pg.PoolClient {
      if (handle.client === null) {
        throw new HarnessMisconfiguredError('No transaction — are you inside a test?');
      }
      return handle.client;
    },
  };

  beforeEach(async () => {
    handle.client = await getPool().connect();
    await handle.client.query('BEGIN');
  });

  afterEach(async () => {
    if (handle.client !== null) {
      await handle.client.query('ROLLBACK');
      handle.client.release();
      handle.client = null;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  return ref;
}
