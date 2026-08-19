import type { Clock } from '@erp/platform';
import pg from 'pg';

import type { ApiConfig } from './config.ts';
import type { ServerDependencies } from './dependencies.ts';

/**
 * The composition root: the one place that constructs things with a connection, a clock or a
 * random source in them.
 *
 * `setTypeParser(1082)` is here and nowhere else. It is a **process-global** mutation of the
 * `pg` module, and until this file existed it ran as an import side effect of two repositories
 * that must not know about each other — whichever module was imported first silently decided
 * DATE parsing for the other. A process-global belongs to the process, and this is it.
 *
 * What it does: `pg`'s default `DATE` parser builds a `Date` in the local timezone, which shifts
 * a worked day by one when the machine is not UTC. A worked day is a `date` (BUILD-RULES) and
 * must survive a round trip unchanged, so the column comes back as the string Postgres sent.
 */
const DATE_OID = 1082;

export function installDateTypeParser(): void {
  pg.types.setTypeParser(DATE_OID, (value: string) => value);
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface Composition {
  readonly pool: pg.Pool;
  readonly dependencies: ServerDependencies;
}

export function compose(config: ApiConfig): Composition {
  installDateTypeParser();

  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  return {
    pool,
    dependencies: {
      config,
      clock: systemClock,
      probeDatabase: async () => {
        await pool.query('SELECT 1');
      },
    },
  };
}
