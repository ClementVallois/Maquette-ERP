import type { Clock } from '@erp/platform';

import type { ApiConfig } from './config.ts';
import type { Transactionally } from './persistence/unit-of-work.ts';
import type { PersonaCatalogue } from './personas/catalogue.ts';

/**
 * Everything the routes are allowed to reach, gathered in one place: the composition root builds
 * it, and no route constructs its own. It lives in its own file rather than in `server.ts` so a
 * route can name the type without importing the server that registers it.
 */
export interface ServerDependencies {
  readonly config: ApiConfig;
  readonly clock: Clock;
  /**
   * Resolves when the database answers, rejects otherwise. A function rather than a pool, so
   * `/healthz` — which must depend on nothing — is testable without one.
   */
  readonly probeDatabase: () => Promise<void>;
  /** The four selectable identities of ADR-0023, read from the seeded reference table. */
  readonly personas: PersonaCatalogue;
  /** The transaction boundary. Every route that touches the database goes through it. */
  readonly transactionally: Transactionally;
  /** UUIDv7 (ADR-0041). The composition root owns it; the modules are handed it. */
  readonly newId: () => string;
}
