import type pg from 'pg';

import {
  type Transactionally,
  unitOfWorkOver,
  type UnitOfWork,
} from '../persistence/unit-of-work.ts';

/**
 * The transaction boundary for integration tests: a **savepoint** inside the harness's per-test
 * transaction, never a nested `BEGIN`.
 *
 * `useTestTransaction()` opens `BEGIN` before each test and `ROLLBACK` after it. A `BEGIN` on that
 * same client warns and no-ops; the matching `COMMIT` then commits the *harness's* transaction,
 * and the later `ROLLBACK` finds nothing to undo. The rows survive into every subsequent test in
 * the run, and the "commits together or not at all" test passes for the wrong reason — which is
 * the shape of failure this repository exists to rule out.
 *
 * `SAVEPOINT` / `RELEASE` / `ROLLBACK TO` proves exactly the same property — everything the unit
 * of work wrote is undone on failure and kept on success — from inside the harness's rollback.
 */
export function savepointTransactionally(
  client: pg.PoolClient,
  newId: () => string,
): Transactionally {
  let depth = 0;

  return async <T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T> => {
    const name = `uow_${String(++depth)}`;
    await client.query(`SAVEPOINT ${name}`);

    try {
      const result = await work(unitOfWorkOver(client, newId));
      await client.query(`RELEASE SAVEPOINT ${name}`);

      return result;
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);

      throw error;
    }
  };
}
