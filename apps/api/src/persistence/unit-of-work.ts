import { PgInvoiceRepository, type InvoiceRepository } from '@erp/billing';
import { PgCraRepository, type CraRepository } from '@erp/timesheet';
import type pg from 'pg';

import { uuidv7 } from '../ids/uuidv7.ts';

import { type EventStore, PgEventStore } from './pg-event-store.ts';

/**
 * The transaction boundary, as a dependency rather than as `client.query('BEGIN')` inside a
 * handler.
 *
 * `BUILD-RULES.md` requires that validating a Cra and drafting its invoice "commit together or
 * not at all", and the mechanism ADR-0001 chose is that the subscriber's writes go through the
 * emitter's **ambient** transaction. That only holds if every repository in one unit of work is
 * built over **one checked-out client**. Building them once at startup over the pool would give
 * each call a different connection, each with its own implicit transaction — and every existing
 * integration test would still pass, because the harness hands one client to everything.
 *
 * Making the boundary injectable is also what keeps the integration tests honest. The harness
 * opens `BEGIN` in `beforeEach` and `ROLLBACK` in `afterEach`; a nested `BEGIN … COMMIT` on that
 * same client would warn, no-op, and then **commit the harness's own transaction** — after which
 * the rollback finds nothing to roll back and every later test in the run reads the leaked rows.
 * The test implementation therefore uses a savepoint, which proves the same all-or-nothing
 * property from inside the harness's transaction instead of destroying it.
 */

export interface UnitOfWork {
  readonly cras: CraRepository;
  readonly invoices: InvoiceRepository;
  readonly events: EventStore;
  /**
   * The client the three above are built over. Exposed because the composition root reads the
   * reference projections of ADR-0031 from `public.*` inside the same transaction — a read that
   * belongs to no module, and so has no repository to come through.
   */
  readonly client: pg.PoolClient;
}

/** Runs `work` in one transaction: it commits, or nothing it did happened. */
export type Transactionally = <T>(work: (unit: UnitOfWork) => Promise<T>) => Promise<T>;

export interface PgClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Every repository over the same client, so their writes share one transaction. */
export function unitOfWorkOver(client: pg.PoolClient, newId: () => string): UnitOfWork {
  return {
    cras: new PgCraRepository(client, newId),
    invoices: new PgInvoiceRepository(client, newId),
    events: new PgEventStore(client),
    client,
  };
}

export function pgTransactionally(pool: pg.Pool, newId: () => string = uuidv7): Transactionally {
  return async <T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T> => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await work(unitOfWorkOver(client, newId));
      await client.query('COMMIT');

      return result;
    } catch (error) {
      // A failed statement leaves the transaction aborted, so the rollback is the only statement
      // that can still run — and if even that fails the connection is broken, which the release
      // below discards. Either way the original failure is what the caller must see.
      await client.query('ROLLBACK').catch(() => undefined);

      throw error;
    } finally {
      client.release();
    }
  };
}
